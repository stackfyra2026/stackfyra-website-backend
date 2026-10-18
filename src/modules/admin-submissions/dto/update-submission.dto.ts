import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { SubmissionStatus } from '../../../database/schemas/form-submission.schema.js';

export class UpdateSubmissionDto {
  @ApiPropertyOptional({
    enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'])
  status?: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Assigned User ID or null' })
  @IsOptional()
  assignedTo?: string | null;
}
