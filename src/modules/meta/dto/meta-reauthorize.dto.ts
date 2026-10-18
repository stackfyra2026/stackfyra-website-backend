import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MetaReauthorizeDto {
  @ApiPropertyOptional({
    description: 'Reason for flagging reauthorization',
    example: 'Token expired or permission revoked',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
