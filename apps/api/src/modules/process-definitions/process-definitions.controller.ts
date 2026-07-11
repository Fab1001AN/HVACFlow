import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseBoolPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProcessDefinitionsService } from './process-definitions.service';
import { CreateProcessDefinitionDto } from './dto/create-process-definition.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

@ApiTags('Configuration / Process Definitions')
@ApiBearerAuth()
@Controller('process-definitions')
export class ProcessDefinitionsController {
  constructor(private readonly service: ProcessDefinitionsService) {}

  @Get()
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.service.findAll(departmentId, isActive);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('config:manage')
  create(@Body() dto: CreateProcessDefinitionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProcessDefinitionDto> & { isActive?: boolean }) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
