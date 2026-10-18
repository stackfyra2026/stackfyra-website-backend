import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SubmissionType } from '../../../database/schemas/form-submission.schema.js';

export class SendInquiryDto {
  @ApiProperty({
    description: 'Inquiry submission type',
    enum: ['quick-inquiry', 'book-consultation', 'landing-page-lead'],
    example: 'quick-inquiry',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['quick-inquiry', 'book-consultation', 'landing-page-lead'])
  type: SubmissionType;

  @ApiPropertyOptional({ description: 'Prospect full name', example: 'Alex Smith' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Contact email address', example: 'alex@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Contact phone number', example: '+1 555-019-2831' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Company or organization', example: 'Acme Corp' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'United States' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ description: 'Requested service', example: 'SaaS Product Development' })
  @IsString()
  @IsOptional()
  service?: string;

  @ApiPropertyOptional({ description: 'Project type', example: 'Web & Mobile MVP' })
  @IsString()
  @IsOptional()
  projectType?: string;

  @ApiPropertyOptional({ description: 'Budget range', example: '$10k - $25k' })
  @IsString()
  @IsOptional()
  budgetRange?: string;

  @ApiPropertyOptional({ description: 'Estimated timeline', example: '4-8 Weeks' })
  @IsString()
  @IsOptional()
  timeline?: string;

  @ApiPropertyOptional({ description: 'Project description', example: 'Need a scalable cloud architecture.' })
  @IsString()
  @IsOptional()
  projectDescription?: string;

  @ApiPropertyOptional({ description: 'Project overview', example: 'Fintech platform' })
  @IsString()
  @IsOptional()
  project?: string;

  @ApiPropertyOptional({ description: 'Preferred contact method', example: 'Email' })
  @IsString()
  @IsOptional()
  preferredContact?: string;

  @ApiPropertyOptional({ description: 'Message details' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Lead source', example: 'Stackfyra Website' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utm_source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utm_medium?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utm_campaign?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utm_term?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utm_content?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  gclid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fbclid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  country_name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  postal?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ip?: string;
}
