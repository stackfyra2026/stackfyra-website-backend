import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Corporate @stackfyra.com email address',
    example: 'admin@stackfyra.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password', example: 'AdminPass123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
