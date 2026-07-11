import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService, CreateUnitDto, UpdateUnitDto } from './units.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { WorkflowProgressModule } from '../workflow-progress/workflow-progress.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('Units')
@ApiBearerAuth()
@Controller()
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get('orders/:orderId/units')
  @RequirePermissions('unit:view')
  findByOrder(
    @Param('orderId') orderId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.service.findByOrder(orderId, pagination.page, pagination.pageSize);
  }

  @Get('units/:id')
  @RequirePermissions('unit:view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('orders/:orderId/units')
  @RequirePermissions('unit:manage')
  create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateUnitDto,
    @CurrentUser() user: JwtPayload,
  ) {
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
