import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { LeadStatus } from '../../../database/schemas/lead.schema.js';

export class UpdateLeadDto {
  @ApiPropertyOptional({
    enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'])
  status?: LeadStatus;

  @ApiPropertyOptional({ description: 'Internal team notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Assigned User ObjectId or null' })
  @IsOptional()
  assignedTo?: string | null;
}
