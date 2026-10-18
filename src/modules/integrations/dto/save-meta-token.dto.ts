import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveMetaTokenDto {
  @ApiProperty({
    description: 'Meta Page Access Token or System User Token',
    example: 'EAAG...',
  })
  @IsNotEmpty({ message: 'Page Access Token is required.' })
  @IsString()
  token!: string;

  @ApiPropertyOptional({
    description: 'Optional Facebook Page ID',
    example: '109823478912345',
  })
  @IsOptional()
  @IsString()
  pageId?: string;

  @ApiPropertyOptional({
    description: 'Optional Facebook Page Name',
    example: 'Stackfyra Inc.',
  })
  @IsOptional()
  @IsString()
  pageName?: string;

  @ApiPropertyOptional({
    description: 'Confirm overwrite if active connection already exists',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
