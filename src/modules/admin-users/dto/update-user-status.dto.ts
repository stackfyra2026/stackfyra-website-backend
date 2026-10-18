import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({ description: 'Active status', example: true })
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
