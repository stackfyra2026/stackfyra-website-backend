import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMetaFormsDto {
  @ApiProperty({ description: 'Facebook Page ID', example: '1029384756' })
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @ApiProperty({
    description: 'Array of Form IDs enabled for lead syncing',
    example: ['123456789', '987654321'],
  })
  @IsArray()
  selectedForms: string[];
}
