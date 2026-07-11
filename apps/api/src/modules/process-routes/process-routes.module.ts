import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProcessRoutesService, CreateProcessRouteDto, UpdateProcessRouteDto, ReorderRoutesDto } from './process-routes.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Configuration / Process Routes')
@ApiBearerAuth()
@Controller('process-routes')
export class ProcessRoutesController {
  constructor(private readonly service: ProcessRoutesService) {}

  @Get()
  findByType(
    @Query('unitTypeId') unitTypeId?: string,
    @Query('partTypeId') partTypeId?: string,
  ) {
    return this.service.findByType(unitTypeId, partTypeId);
  }

  @Post()
  @RequirePermissions('config:manage')
  create(@Body() dto: CreateProcessRouteDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  @RequirePermissions('config:manage')
  reorder(@Body() dto: ReorderRoutesDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateProcessRouteDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [ProcessRoutesController],
  providers: [ProcessRoutesService],
  exports: [ProcessRoutesService],
})
export class ProcessRoutesModule {}
