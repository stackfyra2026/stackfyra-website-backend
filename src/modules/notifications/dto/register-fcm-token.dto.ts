import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterFcmTokenDto {
  @ApiProperty({ description: 'FCM push registration token', example: 'fcm_token_xyz' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ description: 'Unique device identifier', example: 'dev_123456' })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'User-agent string', example: 'Mozilla/5.0...' })
  @IsString()
  @IsOptional()
  userAgent?: string;
}
