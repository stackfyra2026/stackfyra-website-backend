import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RetryEmailDto {
  @ApiPropertyOptional({
    description: 'Maximum number of outbox jobs to process in this run (1 - 50)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
