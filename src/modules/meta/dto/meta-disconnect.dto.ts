import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MetaDisconnectDto {
  @ApiPropertyOptional({ description: 'Optional specific Page ID to disconnect. If omitted, disconnects all.' })
  @IsString()
  @IsOptional()
  pageId?: string;
}
