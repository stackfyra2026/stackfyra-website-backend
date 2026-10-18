import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReauthorizeMetaDto {
  @ApiPropertyOptional({
    description: 'Reason for flagging Meta integration for reauthorization',
    example: 'Manual reauthorization requested by admin.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
