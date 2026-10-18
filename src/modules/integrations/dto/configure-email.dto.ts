import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfigureEmailDto {
  @ApiPropertyOptional({
    description: 'Resend API Key to store and encrypt with AES-256-GCM',
    example: 're_1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Display name of sender',
    example: 'Stackfyra Support',
  })
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional({
    description: 'Sender email address',
    example: 'info@stackfyra.com',
  })
  @IsOptional()
  @IsEmail()
  senderEmail?: string;

  @ApiPropertyOptional({
    description: 'Reply-To email address',
    example: 'info@stackfyra.com',
  })
  @IsOptional()
  @IsEmail()
  replyToEmail?: string;

  @ApiPropertyOptional({
    description: 'Recipients for alert and lead notification emails',
    example: ['admin@stackfyra.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notificationRecipients?: string[];

  @ApiPropertyOptional({
    description: 'Event types that trigger administrative email alerts',
    example: {
      newWebsiteLead: true,
      newMetaLead: true,
      contactForm: true,
      tokenExpiryWarning: true,
      metaAuthFailure: true,
      emailAuthFailure: true,
      deliveryFailure: true,
    },
  })
  @IsOptional()
  @IsObject()
  notificationRules?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Confirm overwrite if active credentials already exist',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
