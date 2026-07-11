import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseBoolPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PriorityLevelsService } from './priority-levels.service';
import { CreatePriorityLevelDto } from './dto/create-priority-level.dto';
import { UpdatePriorityLevelDto } from './dto/update-priority-level.dto';
import { ReorderDto } from '../departments/dto/reorder.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Configuration / Priority Levels')
@ApiBearerAuth()
@Controller('priority-levels')
export class PriorityLevelsController {
  constructor(private readonly service: PriorityLevelsService) {}

  @Get()
  findAll(@Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean) {
    return this.service.findAll(isActive);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('config:manage')
  create(@Body() dto: CreatePriorityLevelDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  @RequirePermissions('config:manage')
  reorder(@Body() dto: ReorderDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdatePriorityLevelDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
