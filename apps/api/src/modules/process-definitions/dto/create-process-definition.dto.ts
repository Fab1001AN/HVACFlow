import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsUUID,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppliesTo } from '@hvacflow/shared-types';

export class CreateProcessDefinitionDto {
  @ApiProperty({ example: 'Cutting' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'CUT' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsUUID()
  departmentId: string;

  @ApiProperty({ enum: AppliesTo })
  @IsEnum(AppliesTo)
  appliesTo: AppliesTo;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresChecklist?: boolean = false;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresVerification?: boolean = false;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultEstimatedMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultPriorityLevelId?: string;

  @ApiPropertyOptional({ default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  weight?: number = 1.0;
}
