import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  UnitsService,
  CreateUnitDto,
  UpdateUnitDto,
  MoveUnitDto,
  AddUnitCommentDto,
} from './units.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { WorkflowProgressModule } from '../workflow-progress/workflow-progress.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { UnitStatus } from '@prisma/client';

@ApiTags('Units & Production Planning')
@ApiBearerAuth()
@Controller()
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get('units')
  @RequirePermissions('unit:view')
  findAll(
    @Query() pagination: PaginationQueryDto,
    @Query('status') status?: UnitStatus,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.service.findAll(pagination.page, pagination.pageSize, status, departmentId);
  }

  @Get('units/calendar')
  @RequirePermissions('unit:view')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.calendar(from, to);
  }

  @Get('units/search')
  @RequirePermissions('unit:view')
  search(@Query('q') q?: string) {
    return this.service.search(q ?? '');
  }

  @Get('units/manager-summary')
  @RequirePermissions('unit:view')
  managerSummary() { return this.service.managerSummary(); }

  @Get('units/engineering-queue')
  @RequirePermissions('unit:view')
  engineeringQueue() { return this.service.engineeringQueue(); }

  @Get('units/director-summary')
  @RequirePermissions('director:view')
  directorSummary() {
    return this.service.directorSummary();
  }

  @Post('units')
  @RequirePermissions('unit:manage')
  createDirect(@Body() dto: CreateUnitDto, @CurrentUser() user: JwtPayload) {
    return this.service.createDirect(dto, user.sub);
  }

  @Patch('units/:id/move')
  @RequirePermissions('unit:manage')
  move(@Param('id') id: string, @Body() dto: MoveUnitDto) {
    return this.service.move(id, dto);
  }

  @Post('units/:id/engineering/advance')
  @RequirePermissions('unit:manage')
  advanceEngineering(@Param('id') id: string) { return this.service.advanceEngineering(id); }

  @Post('units/:id/release')
  @RequirePermissions('unit:manage')
  release(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.service.releaseToProduction(id, user.sub); }

  @Post('units/:id/start-manufacturing')
  @RequirePermissions('task:start')
  startManufacturing(@Param('id') id: string) { return this.service.startManufacturing(id); }

  @Post('units/:id/comments')
  @RequirePermissions('unit:view')
  addComment(@Param('id') id: string, @Body() dto: AddUnitCommentDto, @CurrentUser() user: JwtPayload) {
    return this.service.addComment(id, dto, user.sub);
  }

  @Get('orders/:orderId/units')
  @RequirePermissions('unit:view')
  findByOrder(@Param('orderId') orderId: string, @Query() pagination: PaginationQueryDto) {
    return this.service.findByOrder(orderId, pagination.page, pagination.pageSize);
  }

  @Get('units/:id')
  @RequirePermissions('unit:view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('orders/:orderId/units')
  @RequirePermissions('unit:manage')
  create(@Param('orderId') orderId: string, @Body() dto: CreateUnitDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(orderId, dto, user.sub);
  }

  @Patch('units/:id')
  @RequirePermissions('unit:manage')
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.service.update(id, dto);
  }

  @Delete('units/:id')
  @RequirePermissions('unit:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get('units/:id/tasks')
  @RequirePermissions('unit:view')
  getAllTasks(@Param('id') id: string) {
    return this.service.getAllTasks(id);
  }
}

@Module({
  imports: [WorkflowProgressModule, RealtimeModule],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
