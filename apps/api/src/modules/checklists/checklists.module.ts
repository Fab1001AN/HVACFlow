import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseBoolPipe, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChecklistsService, CreateChecklistTemplateDto, CreateChecklistItemDto, UpdateChecklistItemDto } from './checklists.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Configuration / Checklists')
@ApiBearerAuth()
@Controller('checklist-templates')
export class ChecklistsController {
  constructor(private readonly service: ChecklistsService) {}

  @Get()
  findAll(
    @Query('processDefinitionId') processDefinitionId?: string,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.service.findAll(processDefinitionId, isActive);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('config:manage')
  create(@Body() dto: CreateChecklistTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: { name?: string; isActive?: boolean }) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/items')
  findItems(@Param('id') id: string) {
    return this.service.findItems(id);
  }

  @Post(':id/items')
  @RequirePermissions('config:manage')
  addItem(@Param('id') id: string, @Body() dto: CreateChecklistItemDto) {
    return this.service.addItem(id, dto);
  }

  @Patch(':id/items/reorder')
  @RequirePermissions('config:manage')
  reorderItems(@Param('id') id: string, @Body() body: { items: Array<{ id: string; sortOrder: number }> }) {
    return this.service.reorderItems(id, body.items);
  }
}

@ApiTags('Configuration / Checklists')
@ApiBearerAuth()
@Controller('checklist-items')
export class ChecklistItemsController {
  constructor(private readonly service: ChecklistsService) {}

  @Patch(':id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateChecklistItemDto) {
    return this.service.updateItem(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.removeItem(id);
  }
}

@Module({
  controllers: [ChecklistsController, ChecklistItemsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
