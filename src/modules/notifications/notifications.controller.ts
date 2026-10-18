import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@ApiTags('Admin Notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/fcm-token')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register or update FCM device token for admin notifications' })
  @ApiResponse({ status: 200, description: 'Token registered successfully' })
  async registerToken(
    @CurrentUser() user: any,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    const result = await this.notificationsService.registerDeviceToken(
      user._id || user.userId,
      dto.token,
      dto.deviceId,
      dto.userAgent,
    );

    return {
      success: true,
      message: 'FCM token and device ID pushed successfully.',
      deviceId: result.deviceId,
      deviceCount: result.deviceCount,
    };
  }
}
