import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRoleDto {
  @ApiProperty({ description: 'User role', example: 'ADMIN' })
  @IsString()
  @IsNotEmpty()
  role: string;
}
