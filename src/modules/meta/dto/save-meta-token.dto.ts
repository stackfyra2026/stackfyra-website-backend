import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveMetaTokenDto {
  @ApiProperty({ description: 'Page Access Token or System User Token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ description: 'Facebook Page ID' })
  @IsString()
  @IsOptional()
  pageId?: string;

  @ApiPropertyOptional({ description: 'Facebook Page Name' })
  @IsString()
  @IsOptional()
  pageName?: string;

  @ApiPropertyOptional({ description: 'Confirm replacing active working token', default: false })
  @IsBoolean()
  @IsOptional()
  confirmOverwrite?: boolean;
}
