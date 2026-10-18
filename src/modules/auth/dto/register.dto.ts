import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'User display name', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({
    description: 'Corporate @stackfyra.com email address',
    example: 'jane.doe@stackfyra.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password (min 8 characters)',
    example: 'SecretPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
