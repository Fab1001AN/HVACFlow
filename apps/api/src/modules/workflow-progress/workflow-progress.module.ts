import { Module } from '@nestjs/common';
import { WorkflowProgressService } from './workflow-progress.service';

@Module({
  providers: [WorkflowProgressService],
  exports: [WorkflowProgressService],
})
export class WorkflowProgressModule {}
