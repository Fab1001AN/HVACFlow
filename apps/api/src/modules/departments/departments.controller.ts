import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseBoolPipe, Optional } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ReorderDto } from './dto/reorder.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Configuration / Departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions('department:view')
  @ApiOperation({ summary: 'List all departments ordered by sortOrder' })
  findAll(@Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean) {
    return this.service.findAll(isActive);
  }

  @Get(':id')
  @RequirePermissions('department:view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/impact')
  @RequirePermissions('config:manage')
  impact(@Param('id') id: string) {
    return this.service.impact(id);
  }

  @Post()
  @RequirePermissions('config:manage')
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  @RequirePermissions('config:manage')
  @ApiOperation({ summary: 'Bulk update sortOrder for Kanban column reordering' })
  reorder(@Body() dto: ReorderDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
