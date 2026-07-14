import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TaskStatus } from '@hvacflow/shared-types';
import { Prisma, UnitStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateUnitDto {
  @IsUUID() unitTypeId: string;
  @IsString() serialNumber: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsUUID() priorityLevelId?: string;
  @IsOptional() @IsUUID() currentDepartmentId?: string;
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) priorityPosition?: number;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
  @IsOptional() @IsUrl({ require_protocol: true }) oneDriveFolderUrl?: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsUUID() unitTypeId?: string;
  @IsOptional() @IsUUID() priorityLevelId?: string;
  @IsOptional() @IsUUID() currentDepartmentId?: string;
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) priorityPosition?: number;
  @IsOptional() @IsString() currentStage?: string;
  @IsOptional() @IsBoolean() isBlocked?: boolean;
  @IsOptional() @IsString() holdReason?: string;
  @IsOptional() @IsString() status?: UnitStatus;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
  @IsOptional() @IsUrl({ require_protocol: true }) oneDriveFolderUrl?: string;
  @IsOptional() @IsBoolean() submittalReceived?: boolean;
  @IsOptional() @IsBoolean() designComplete?: boolean;
  @IsOptional() @IsBoolean() drawingsAvailable?: boolean;
  @IsOptional() @IsBoolean() programmingFilesComplete?: boolean;
  @IsOptional() @IsBoolean() cuttingProgramsAvailable?: boolean;
}

export class MoveUnitDto {
  @IsDateString() plannedStartDate: string;
  @IsInt() @Min(0) priorityPosition: number;
}

export class AddUnitCommentDto {
  @IsString() message: string;
  @IsOptional() @IsBoolean() isDelay?: boolean;
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowProgress: WorkflowProgressService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findAll(page = 1, pageSize = 100, status?: UnitStatus, departmentId?: string) {
    const where: Prisma.UnitWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(departmentId ? { currentDepartmentId: departmentId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: this.unitSummaryInclude(),
        orderBy: [{ plannedStartDate: 'asc' }, { priorityPosition: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.unit.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async calendar(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const end = to ? new Date(to) : new Date(new Date().getFullYear(), new Date().getMonth() + 5, 1);
    return this.prisma.unit.findMany({
      where: {
        deletedAt: null,
        OR: [
          { plannedStartDate: { gte: start, lt: end } },
          { plannedStartDate: null },
        ],
      },
      include: this.unitSummaryInclude(),
      orderBy: [{ plannedStartDate: 'asc' }, { priorityPosition: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async directorSummary() {
    const now = new Date();
    const units = await this.prisma.unit.findMany({
      where: { deletedAt: null, status: { notIn: ['Completed', 'Dispatched'] } },
      include: this.unitSummaryInclude(),
      orderBy: [{ isBlocked: 'desc' }, { dueDate: 'asc' }, { priorityPosition: 'asc' }],
    });

    const departmentLoad = await this.prisma.productionTask.groupBy({
      by: ['departmentId'],
      where: { status: { in: ['Ready', 'InProgress', 'PendingVerification', 'OnHold'] } },
      _count: { _all: true },
    });
    const departments = await this.prisma.department.findMany({ where: { isActive: true } });
    const departmentMap = new Map(departments.map((d) => [d.id, d]));

    return {
      totals: {
        active: units.length,
        blocked: units.filter((u) => u.isBlocked).length,
        delayed: units.filter((u) => u.dueDate && u.dueDate < now).length,
        testing: units.filter((u) => (u.currentStage ?? '').toLowerCase().includes('test')).length,
        readyToDispatch: units.filter((u) => (u.currentStage ?? '').toLowerCase().includes('dispatch')).length,
      },
      departmentLoad: departmentLoad
        .map((row) => ({
          departmentId: row.departmentId,
          department: departmentMap.get(row.departmentId),
          openTasks: row._count._all,
        }))
        .sort((a, b) => b.openTasks - a.openTasks),
      units,
    };
  }

  async findByOrder(orderId: string, page = 1, pageSize = 25) {
    const where = { orderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: this.unitSummaryInclude(),
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.unit.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id, deletedAt: null },
      include: {
        order: { include: { project: { include: { customer: true } }, priorityLevel: true } },
        unitType: true,
        priorityLevel: true,
        currentDepartment: true,
        createdBy: { select: { id: true, name: true, email: true } },
        comments: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        parts: {
          where: { deletedAt: null },
          include: {
            partType: true,
            tasks: {
              include: { processDefinition: { include: { department: true } }, department: true, priorityLevel: true },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          include: {
            processDefinition: { include: { department: true } },
            department: true,
            priorityLevel: true,
            assignedUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async createDirect(dto: CreateUnitDto, userId: string) {
    const priority = dto.priorityLevelId
      ? await this.prisma.priorityLevel.findUnique({ where: { id: dto.priorityLevelId } })
      : await this.prisma.priorityLevel.findFirst({ where: { isDefault: true, isActive: true } });
    if (!priority) throw new BadRequestException('Configure a default priority level first');

    const unitType = await this.prisma.unitType.findUnique({ where: { id: dto.unitTypeId } });
    if (!unitType) throw new NotFoundException('Unit type not found');

    const composition = await this.prisma.unitTypeComposition.findMany({
      where: { unitTypeId: dto.unitTypeId, isActive: true },
      include: { partType: true },
      orderBy: { sortOrder: 'asc' },
    });
    const unitRoutes = await this.prisma.processRoute.findMany({
      where: { unitTypeId: dto.unitTypeId, isActive: true },
      include: { processDefinition: true },
      orderBy: { sequenceOrder: 'asc' },
    });

    const unit = await this.prisma.$transaction(async (tx) => {
      const newUnit = await tx.unit.create({
        data: {
          unitTypeId: dto.unitTypeId,
          serialNumber: dto.serialNumber,
          displayName: dto.displayName,
          priorityLevelId: priority.id,
          currentDepartmentId: dto.currentDepartmentId,
          plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          priorityPosition: dto.priorityPosition ?? 0,
          oneDriveFolderUrl: dto.oneDriveFolderUrl,
          specifications: dto.specifications as Prisma.InputJsonValue | undefined,
          currentStage: 'Engineering',
          createdByUserId: userId,
        },
      });

      for (const comp of composition.filter((c) => !c.isOptional)) {
        await this.createPartWithTasks(tx, newUnit.id, comp.partTypeId, comp.defaultQuantity, priority.id, userId);
      }

      let previousTaskId: string | null = null;
      for (const route of unitRoutes) {
        const task: { id: string } = await tx.productionTask.create({
          data: {
            unitId: newUnit.id,
            departmentId: route.processDefinition.departmentId,
            processDefinitionId: route.processDefinitionId,
            sequenceOrder: route.sequenceOrder,
            status: TaskStatus.Pending,
            priorityLevelId: route.processDefinition.defaultPriorityLevelId ?? priority.id,
            estimatedDurationMinutes: route.processDefinition.defaultEstimatedMinutes,
            parentTaskId: previousTaskId,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
        if (previousTaskId) {
          await tx.productionTask.update({ where: { id: previousTaskId }, data: { nextTaskId: task.id } });
        }
        previousTaskId = task.id;
      }
      return newUnit;
    });

    return this.findOne(unit.id);
  }

  async create(orderId: string, dto: CreateUnitDto, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'Cancelled') throw new BadRequestException('Cannot add units to a cancelled order');
    return this.createDirect({ ...dto, priorityLevelId: order.priorityLevelId }, userId).then(async (unit) => {
      await this.prisma.unit.update({ where: { id: unit.id }, data: { orderId } });
      return { unit: await this.findOne(unit.id), optionalParts: [] };
    });
  }

  async move(id: string, dto: MoveUnitDto) {
    await this.findOne(id);
    return this.prisma.unit.update({
      where: { id },
      data: { plannedStartDate: new Date(dto.plannedStartDate), priorityPosition: dto.priorityPosition },
      include: this.unitSummaryInclude(),
    });
  }

  async update(id: string, dto: UpdateUnitDto) {
    await this.findOne(id);
    const data: Prisma.UnitUpdateInput = {
      serialNumber: dto.serialNumber,
      displayName: dto.displayName,
      status: dto.status,
      currentStage: dto.currentStage,
      isBlocked: dto.isBlocked,
      holdReason: dto.holdReason,
      oneDriveFolderUrl: dto.oneDriveFolderUrl,
      submittalReceived: dto.submittalReceived,
      designComplete: dto.designComplete,
      drawingsAvailable: dto.drawingsAvailable,
      programmingFilesComplete: dto.programmingFilesComplete,
      cuttingProgramsAvailable: dto.cuttingProgramsAvailable,
      priorityPosition: dto.priorityPosition,
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      specifications: dto.specifications as Prisma.InputJsonValue | undefined,
      unitType: dto.unitTypeId ? { connect: { id: dto.unitTypeId } } : undefined,
      priorityLevel: dto.priorityLevelId ? { connect: { id: dto.priorityLevelId } } : undefined,
      currentDepartment: dto.currentDepartmentId ? { connect: { id: dto.currentDepartmentId } } : undefined,
    };
    return this.prisma.unit.update({ where: { id }, data, include: this.unitSummaryInclude() });
  }

  async addComment(id: string, dto: AddUnitCommentDto, userId: string) {
    await this.findOne(id);
    return this.prisma.unitComment.create({
      data: { unitId: id, userId, message: dto.message, isDelay: dto.isDelay ?? false },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const inProgressCount = await this.prisma.productionTask.count({
      where: { OR: [{ unitId: id }, { part: { unitId: id } }], status: { in: ['InProgress', 'PendingVerification'] } },
    });
    if (inProgressCount > 0) throw new ConflictException('Cannot delete unit with tasks in progress');
    return this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getAllTasks(unitId: string) {
    await this.findOne(unitId);
    return this.prisma.productionTask.findMany({
      where: { OR: [{ unitId }, { part: { unitId } }] },
      include: {
        processDefinition: { include: { department: true } },
        department: true,
        priorityLevel: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        part: { include: { partType: true } },
      },
      orderBy: [{ part: { identifier: 'asc' } }, { sequenceOrder: 'asc' }],
    });
  }

  private unitSummaryInclude(): Prisma.UnitInclude {
    return {
      unitType: true,
      priorityLevel: true,
      currentDepartment: true,
      _count: { select: { parts: { where: { deletedAt: null } }, comments: true } },
    };
  }

  async createPartWithTasks(
    tx: Prisma.TransactionClient,
    unitId: string,
    partTypeId: string,
    quantity: number,
    priorityLevelId: string,
    userId: string,
  ) {
    const routes = await tx.processRoute.findMany({
      where: { partTypeId, isActive: true },
      include: { processDefinition: true },
      orderBy: { sequenceOrder: 'asc' },
    });
    const part = await tx.part.create({
      data: {
        unitId,
        partTypeId,
        identifier: `${partTypeId.slice(0, 4).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        quantity,
        createdByUserId: userId,
      },
    });
    let previousTaskId: string | null = null;
    for (const route of routes) {
      const task: { id: string } = await tx.productionTask.create({
        data: {
          partId: part.id,
          departmentId: route.processDefinition.departmentId,
          processDefinitionId: route.processDefinitionId,
          sequenceOrder: route.sequenceOrder,
          status: previousTaskId ? TaskStatus.Pending : TaskStatus.Ready,
          priorityLevelId: route.processDefinition.defaultPriorityLevelId ?? priorityLevelId,
          estimatedDurationMinutes: route.processDefinition.defaultEstimatedMinutes,
          parentTaskId: previousTaskId,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      if (previousTaskId) {
        await tx.productionTask.update({ where: { id: previousTaskId }, data: { nextTaskId: task.id } });
      }
      previousTaskId = task.id;
    }
    return part;
  }
}
