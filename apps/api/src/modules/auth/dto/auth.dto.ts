import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@hvacflow.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@HVACFlow1' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'At least 8 characters' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
