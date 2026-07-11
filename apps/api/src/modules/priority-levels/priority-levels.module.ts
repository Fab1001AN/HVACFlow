import { Module } from '@nestjs/common';
import { PriorityLevelsController } from './priority-levels.controller';
import { PriorityLevelsService } from './priority-levels.service';

@Module({
  controllers: [PriorityLevelsController],
  providers: [PriorityLevelsService],
  exports: [PriorityLevelsService],
})
export class PriorityLevelsModule {}
