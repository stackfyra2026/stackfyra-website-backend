import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryLeadsDto {
  @ApiPropertyOptional({ default: '1' })
  @IsString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ default: '10' })
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive search on name, email, phone, company, campaign' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: ['ALL', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'GOOGLE_ADS', 'LINKEDIN', 'OTHER'],
    default: 'ALL',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    enum: ['ALL', 'NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
    default: 'ALL',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date ISO string' })
  @IsString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Assigned User ObjectId' })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Set to "csv" or "true" for CSV download' })
  @IsString()
  @IsOptional()
  export?: string;
}
