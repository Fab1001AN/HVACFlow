import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { IsString, IsOptional, IsUUID, IsObject, IsInt, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UnitsService } from '../units/units.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload, TaskStatus } from '@hvacflow/shared-types';
import { Prisma } from '@prisma/client';
import { WorkflowProgressModule } from '../workflow-progress/workflow-progress.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UnitsModule } from '../units/units.module';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

class CreatePartDto {
  @IsUUID() partTypeId: string;
  @IsString() identifier: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number = 1;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
}

class UpdatePartDto {
  @IsOptional() @IsString() identifier?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
}

@Injectable()
export class PartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowProgress: WorkflowProgressService,
    private readonly realtime: RealtimeGateway,
    private readonly unitsService: UnitsService,
  ) {}

  async findByUnit(unitId: string, page = 1, pageSize = 50) {
    const where = { unitId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.part.findMany({
        where,
        include: {
          partType: true,
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.part.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const part = await this.prisma.part.findUnique({
      where: { id, deletedAt: null },
      include: {
        unit: { include: { order: { include: { priorityLevel: true } } } },
        partType: true,
        tasks: {
          include: {
            processDefinition: { include: { department: true } },
            priorityLevel: true,
            assignedUser: { select: { id: true, name: true, email: true } },
            machine: true,
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });
    if (!part) throw new NotFoundException('Part not found');
    return part;
  }

  async create(unitId: string, dto: CreatePartDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId, deletedAt: null },
      include: { order: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');

    const part = await this.prisma.$transaction(async (tx) => {
      return this.unitsService.createPartWithTasks(
        tx,
        unitId,
        dto.partTypeId,
        dto.quantity ?? 1,
        unit.order.priorityLevelId,
        userId,
      );
    });

    // Update identifier if provided
    if (dto.identifier) {
      await this.prisma.part.update({
        where: { id: part.id },
        data: { identifier: dto.identifier },
      });
    }

    // Recompute unit progress
    await this.workflowProgress.recomputeUnit(unitId);

    // Emit task.created for all new tasks
    const tasks = await this.prisma.productionTask.findMany({
      where: { partId: part.id },
      include: { department: true, processDefinition: true, priorityLevel: true },
    });
    for (const task of tasks) {
      this.realtime.emitTaskCreated(task.departmentId, { task: task as any });
    }

    return this.findOne(part.id);
  }

  async update(id: string, dto: UpdatePartDto) {
  await this.findOne(id);

  const data: Prisma.PartUpdateInput = {
    ...dto,
    specifications:
      dto.specifications === undefined
        ? undefined
        : (dto.specifications as Prisma.InputJsonValue),
  };

  return this.prisma.part.update({
    where: { id },
    data,
    include: { partType: true },
  });
}

  async remove(id: string) {
    const part = await this.findOne(id);
    const inProgressCount = await this.prisma.productionTask.count({
      where: { partId: id, status: { in: ['InProgress', 'PendingVerification', 'Completed'] } },
    });
    if (inProgressCount > 0) {
      throw new ConflictException('Cannot delete part with completed or in-progress tasks');
    }
    return this.prisma.part.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

@ApiTags('Parts')
@ApiBearerAuth()
@Controller()
export class PartsController {
  constructor(private readonly service: PartsService) {}

  @Get('units/:unitId/parts')
  @RequirePermissions('part:view')
  findByUnit(@Param('unitId') unitId: string, @Query() pagination: PaginationQueryDto) {
    return this.service.findByUnit(unitId, pagination.page, pagination.pageSize);
  }

  @Get('parts/:id')
  @RequirePermissions('part:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post('units/:unitId/parts')
  @RequirePermissions('part:manage')
  create(
    @Param('unitId') unitId: string,
    @Body() dto: CreatePartDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(unitId, dto, user.sub);
  }

  @Patch('parts/:id')
  @RequirePermissions('part:manage')
  update(@Param('id') id: string, @Body() dto: UpdatePartDto) {
    return this.service.update(id, dto);
  }

  @Delete('parts/:id')
  @RequirePermissions('part:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [WorkflowProgressModule, RealtimeModule, UnitsModule],
  controllers: [PartsController],
  providers: [PartsService],
  exports: [PartsService],
})
export class PartsModule {}
