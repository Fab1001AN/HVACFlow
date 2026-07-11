import { Module } from '@nestjs/common';
import { ProcessDefinitionsController } from './process-definitions.controller';
import { ProcessDefinitionsService } from './process-definitions.service';

@Module({
  controllers: [ProcessDefinitionsController],
  providers: [ProcessDefinitionsService],
  exports: [ProcessDefinitionsService],
})
export class ProcessDefinitionsModule {}
