import { Controller, Get, Post, Patch, Body, Param, Query, ParseBoolPipe, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductionTasksService, QueryTasksDto, UpdateTaskDto, TaskActionDto } from './production-tasks.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload, TaskStatus } from '@hvacflow/shared-types';
import { WorkflowProgressModule } from '../workflow-progress/workflow-progress.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

class HoldRejectDto extends TaskActionDto {
  @IsString() declare note: string;
}

class ToggleChecklistDto {
  @IsBoolean() isChecked: boolean;
}

@ApiTags('Production Tasks')
@ApiBearerAuth()
@Controller('production-tasks')
export class ProductionTasksController {
  constructor(private readonly service: ProductionTasksService) {}

  @Get()
  @RequirePermissions('task:view')
  @ApiOperation({ summary: 'List production tasks — primary query for Mission Control' })
  findAll(
    @Query() query: QueryTasksDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const hasViewAll = user.permissions.includes('task:view-all');
    return this.service.findAll(query, user.departmentIds, hasViewAll);
  }

  @Get(':id')
  @RequirePermissions('task:view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('task:reassign')
  @ApiOperation({ summary: 'Update mutable fields: priority, assignment, machine, notes' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Post(':id/start')
  @RequirePermissions('task:start')
  @ApiOperation({ summary: 'Transition Ready → InProgress' })
  start(
    @Param('id') id: string,
    @Body() dto: TaskActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.start(id, user.sub, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('task:complete')
  @ApiOperation({ summary: 'Transition InProgress → PendingVerification or Completed' })
  complete(
    @Param('id') id: string,
    @Body() dto: TaskActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.complete(id, user.sub, dto);
  }

  @Post(':id/verify')
  @RequirePermissions('task:verify')
  @ApiOperation({ summary: 'Transition PendingVerification → Completed' })
  verify(
    @Param('id') id: string,
    @Body() dto: TaskActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.verify(id, user.sub, dto);
  }

  @Post(':id/hold')
  @RequirePermissions('task:hold')
  @ApiOperation({ summary: 'Place a task on hold (note required)' })
  hold(
    @Param('id') id: string,
    @Body() dto: HoldRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.hold(id, user.sub, dto);
  }

  @Post(':id/resume')
  @RequirePermissions('task:hold')
  @ApiOperation({ summary: 'Resume a held task' })
  resume(
    @Param('id') id: string,
    @Body() dto: TaskActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resume(id, user.sub, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('task:reject')
  @ApiOperation({ summary: 'Reject a task (note required)' })
  reject(
    @Param('id') id: string,
    @Body() dto: HoldRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(id, user.sub, dto);
  }

  @Get(':id/history')
  @RequirePermissions('task:view')
  getHistory(@Param('id') id: string) {
    return this.service.getHistory(id);
  }

  @Patch(':id/checklist/:responseId')
  @RequirePermissions('task:complete')
  @ApiOperation({ summary: 'Toggle a checklist response item' })
  toggleChecklist(
    @Param('id') id: string,
    @Param('responseId') responseId: string,
    @Body() dto: ToggleChecklistDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.toggleChecklistItem(id, responseId, dto.isChecked, user.sub);
  }
}

@Module({
  imports: [WorkflowProgressModule, RealtimeModule, ChecklistsModule, ActivityLogModule],
  controllers: [ProductionTasksController],
  providers: [ProductionTasksService],
  exports: [ProductionTasksService],
})
export class ProductionTasksModule {}
