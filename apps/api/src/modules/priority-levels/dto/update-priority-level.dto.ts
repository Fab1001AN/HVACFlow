import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePriorityLevelDto } from './create-priority-level.dto';

export class UpdatePriorityLevelDto extends PartialType(CreatePriorityLevelDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
