import { IsString, IsOptional, IsBoolean, IsInt, Matches, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Fabrication' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'FAB' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color code (e.g. #6366f1)' })
  color?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;
}
