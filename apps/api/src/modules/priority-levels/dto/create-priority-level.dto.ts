import { IsString, IsOptional, IsBoolean, IsInt, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePriorityLevelDto {
  @ApiProperty({ example: 'Critical' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '#dc2626' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}
