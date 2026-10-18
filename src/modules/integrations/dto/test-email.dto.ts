import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestEmailDto {
  @ApiProperty({
    description: 'Target email recipient for CRM test verification email',
    example: 'admin@stackfyra.com',
  })
  @IsNotEmpty({ message: 'A valid test recipient email address must be explicitly provided.' })
  @IsEmail({}, { message: 'A valid test recipient email address must be explicitly provided.' })
  recipient!: string;
}
