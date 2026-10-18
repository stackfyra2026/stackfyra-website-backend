import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MetaConnectDto {
  @ApiPropertyOptional({ description: 'OAuth authorization code from Facebook dialog' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ description: 'Direct Page Access Token or System User Token' })
  @IsString()
  @IsOptional()
  directToken?: string;

  @ApiPropertyOptional({ description: 'Facebook Page ID' })
  @IsString()
  @IsOptional()
  pageId?: string;

  @ApiPropertyOptional({ description: 'Facebook Page Name' })
  @IsString()
  @IsOptional()
  pageName?: string;
}
