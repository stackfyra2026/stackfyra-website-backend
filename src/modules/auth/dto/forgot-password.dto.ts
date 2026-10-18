import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Corporate @stackfyra.com email address',
    example: 'admin@stackfyra.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
