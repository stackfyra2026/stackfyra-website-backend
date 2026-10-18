import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { SubmissionStatus } from '../../../database/schemas/form-submission.schema.js';

export class QuerySubmissionsDto {
  @ApiPropertyOptional({ default: '1' })
  @IsString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ default: '10' })
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search term for name, email, phone, company' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'])
  status?: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Set to "csv" or "true" for CSV download' })
  @IsString()
  @IsOptional()
  export?: string;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
