/**
 * Catalog Module
 * Consolidates simple catalog modules: UnitTypes, PartTypes, UnitComposition, Machines.
 */

import {
  Injectable, NotFoundException, ConflictException,
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseBoolPipe, Module,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, IsEnum, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartSourceType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CatalogTypeDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @MaxLength(50) code: string;
  // Only meaningful for PartType - ignored by UnitTypesService/
  // MachinesService, which never read this field off the DTO.
  @ApiPropertyOptional({ enum: PartSourceType }) @IsOptional() @IsEnum(PartSourceType) sourceType?: PartSourceType;
}
class UpdateTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(PartSourceType) sourceType?: PartSourceType;
}
class CreateCompositionDto {
  @ApiProperty() @IsUUID() partTypeId: string;
  @IsOptional() @IsInt() @Min(1) defaultQuantity?: number;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
class UpdateCompositionDto {
  @IsOptional() @IsInt() @Min(1) defaultQuantity?: number;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class CreateMachineDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @MaxLength(50) code: string;
  @ApiProperty() @IsUUID() departmentId: string;
}
class UpdateMachineDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Services ─────────────────────────────────────────────────────────────────

@Injectable()
export class UnitTypesService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(isActive?: boolean) {
    return this.prisma.unitType.findMany({ where: isActive !== undefined ? { isActive } : undefined, orderBy: { name: 'asc' } });
  }
  async findOne(id: string) {
    const ut = await this.prisma.unitType.findUnique({
      where: { id },
      include: {
        composition: { where: { isActive: true }, include: { partType: true }, orderBy: { sortOrder: 'asc' } },
        processRoutes: { where: { isActive: true }, include: { processDefinition: { include: { department: true } } }, orderBy: { sequenceOrder: 'asc' } },
      },
    });
    if (!ut) throw new NotFoundException('Unit type not found');
    return ut;
  }
  create(dto: CatalogTypeDto) { return this.prisma.unitType.create({ data: dto }); }
  async update(id: string, dto: UpdateTypeDto) { await this.findOne(id); return this.prisma.unitType.update({ where: { id }, data: dto }); }
  async remove(id: string) {
    const count = await this.prisma.unit.count({ where: { unitTypeId: id } });
    if (count > 0) throw new ConflictException('Cannot delete unit type with existing units');
    return this.prisma.unitType.delete({ where: { id } });
  }
}

@Injectable()
export class PartTypesService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(isActive?: boolean, sourceType?: PartSourceType) {
    return this.prisma.partType.findMany({
      where: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(sourceType ? { sourceType } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }
  async findOne(id: string) {
    const pt = await this.prisma.partType.findUnique({
      where: { id },
      include: { processRoutes: { where: { isActive: true }, include: { processDefinition: { include: { department: true } } }, orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!pt) throw new NotFoundException('Part type not found');
    return pt;
  }
  create(dto: CatalogTypeDto) { return this.prisma.partType.create({ data: dto }); }
  async update(id: string, dto: UpdateTypeDto) { await this.findOne(id); return this.prisma.partType.update({ where: { id }, data: dto }); }
  async remove(id: string) {
    const count = await this.prisma.part.count({ where: { partTypeId: id } });
    if (count > 0) throw new ConflictException('Cannot delete part type with existing parts');
    return this.prisma.partType.delete({ where: { id } });
  }
}

@Injectable()
export class UnitCompositionService {
  constructor(private readonly prisma: PrismaService) {}
  findByUnitType(unitTypeId: string) {
    return this.prisma.unitTypeComposition.findMany({ where: { unitTypeId, isActive: true }, include: { partType: true }, orderBy: { sortOrder: 'asc' } });
  }
  create(unitTypeId: string, dto: CreateCompositionDto) {
    return this.prisma.unitTypeComposition.create({ data: { unitTypeId, ...dto }, include: { partType: true } });
  }
  async update(id: string, dto: UpdateCompositionDto) {
    const comp = await this.prisma.unitTypeComposition.findUnique({ where: { id } });
    if (!comp) throw new NotFoundException('Composition entry not found');
    return this.prisma.unitTypeComposition.update({ where: { id }, data: dto, include: { partType: true } });
  }
  async reorder(unitTypeId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.prisma.$transaction(items.map(({ id, sortOrder }) => this.prisma.unitTypeComposition.update({ where: { id }, data: { sortOrder } })));
    return this.findByUnitType(unitTypeId);
  }
  async remove(id: string) {
    const comp = await this.prisma.unitTypeComposition.findUnique({ where: { id } });
    if (!comp) throw new NotFoundException('Composition entry not found');
    return this.prisma.unitTypeComposition.delete({ where: { id } });
  }
}

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(departmentId?: string, isActive?: boolean) {
    return this.prisma.machine.findMany({
      where: { ...(departmentId ? { departmentId } : {}), ...(isActive !== undefined ? { isActive } : {}) },
      include: { department: true },
      orderBy: [{ department: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }
  async findOne(id: string) {
    const m = await this.prisma.machine.findUnique({ where: { id }, include: { department: true } });
    if (!m) throw new NotFoundException('Machine not found');
    return m;
  }
  create(dto: CreateMachineDto) { return this.prisma.machine.create({ data: dto, include: { department: true } }); }
  async update(id: string, dto: UpdateMachineDto) { await this.findOne(id); return this.prisma.machine.update({ where: { id }, data: dto, include: { department: true } }); }
  async remove(id: string) {
    const count = await this.prisma.productionTask.count({ where: { machineId: id } });
    if (count > 0) throw new ConflictException('Cannot delete machine with associated tasks. Deactivate instead.');
    return this.prisma.machine.delete({ where: { id } });
  }
}

// ─── Controllers ──────────────────────────────────────────────────────────────

@ApiTags('Configuration / Unit Types')
@Controller('unit-types')
export class UnitTypesController {
  constructor(
    private readonly unitTypesService: UnitTypesService,
    private readonly compositionService: UnitCompositionService,
  ) {}

  @Get()
  findAll(@Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean) { return this.unitTypesService.findAll(isActive); }
  @Get(':id')
  findOne(@Param('id') id: string) { return this.unitTypesService.findOne(id); }
  @Post() @RequirePermissions('config:manage')
  create(@Body() dto: CatalogTypeDto) { return this.unitTypesService.create(dto); }
  @Patch(':id') @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateTypeDto) { return this.unitTypesService.update(id, dto); }
  @Delete(':id') @RequirePermissions('config:manage')
  remove(@Param('id') id: string) { return this.unitTypesService.remove(id); }

  @Get(':unitTypeId/composition')
  getComposition(@Param('unitTypeId') unitTypeId: string) { return this.compositionService.findByUnitType(unitTypeId); }
  @Post(':unitTypeId/composition') @RequirePermissions('config:manage')
  addComposition(@Param('unitTypeId') unitTypeId: string, @Body() dto: CreateCompositionDto) { return this.compositionService.create(unitTypeId, dto); }
  @Patch('composition/:id') @RequirePermissions('config:manage')
  updateComposition(@Param('id') id: string, @Body() dto: UpdateCompositionDto) { return this.compositionService.update(id, dto); }
  @Delete('composition/:id') @RequirePermissions('config:manage')
  removeComposition(@Param('id') id: string) { return this.compositionService.remove(id); }
}

@ApiTags('Configuration / Part Types')
@Controller('part-types')
export class PartTypesController {
  constructor(private readonly service: PartTypesService) {}
  @Get()
  findAll(
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
    @Query('sourceType') sourceType?: PartSourceType,
  ) { return this.service.findAll(isActive, sourceType); }
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() @RequirePermissions('config:manage')
  create(@Body() dto: CatalogTypeDto) { return this.service.create(dto); }
  @Patch(':id') @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateTypeDto) { return this.service.update(id, dto); }
  @Delete(':id') @RequirePermissions('config:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@ApiTags('Configuration / Machines')
@Controller('machines')
export class MachinesController {
  constructor(private readonly service: MachinesService) {}
  @Get()
  findAll(@Query('departmentId') departmentId?: string, @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean) {
    return this.service.findAll(departmentId, isActive);
  }
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() @RequirePermissions('config:manage')
  create(@Body() dto: CreateMachineDto) { return this.service.create(dto); }
  @Patch(':id') @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateMachineDto) { return this.service.update(id, dto); }
  @Delete(':id') @RequirePermissions('config:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

// ─── Modules ──────────────────────────────────────────────────────────────────

@Module({
  controllers: [UnitTypesController, PartTypesController],
  providers: [UnitTypesService, PartTypesService, UnitCompositionService],
  exports: [UnitTypesService, PartTypesService, UnitCompositionService],
})
export class UnitTypesModule {}

@Module({
  controllers: [PartTypesController],
  providers: [PartTypesService],
  exports: [PartTypesService],
})
export class PartTypesModule {}

@Module({
  providers: [UnitCompositionService],
  exports: [UnitCompositionService],
})
export class UnitCompositionModule {}

@Module({
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
