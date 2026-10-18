import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User display name', example: 'Bob Johnson' })
  @IsString()
  @IsOptional()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({
    description: 'Corporate @stackfyra.com email address',
    example: 'bob.updated@stackfyra.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;
}
