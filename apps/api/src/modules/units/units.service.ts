import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EngineeringStatus, Prisma, ProductionReleaseStatus, ProductionTask, UnitStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID, IsUrl, Matches, Min } from 'class-validator';
import { TaskStatus } from '@hvacflow/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class CreateUnitDto {
  @IsUUID() unitTypeId: string;
  @IsString() serialNumber: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsUUID() priorityLevelId?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) productionMonth?: string;
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
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) productionMonth?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) priorityPosition?: number;
  @IsOptional() @IsString() currentStage?: string;
  @IsOptional() @IsBoolean() isBlocked?: boolean;
  @IsOptional() @IsString() holdReason?: string;
  @IsOptional() status?: UnitStatus;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
  @IsOptional() @IsUrl({ require_protocol: true }) oneDriveFolderUrl?: string;
}

export class MoveUnitDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) productionMonth: string;
  @IsInt() @Min(0) priorityPosition: number;
}

export class AddUnitCommentDto {
  @IsString() message: string;
  @IsOptional() @IsBoolean() isDelay?: boolean;
}

const ENGINEERING_SEQUENCE: EngineeringStatus[] = [
  EngineeringStatus.NotStarted,
  EngineeringStatus.SubmittalReceived,
  EngineeringStatus.DesigningStarted,
  EngineeringStatus.UnitDesignCompleted,
  EngineeringStatus.DrawingsCompleted,
  EngineeringStatus.ProgrammingCompleted,
  EngineeringStatus.ReleasedToManufacturing,
];

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowProgress: WorkflowProgressService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private monthValue(value?: string) {
    return value ? new Date(`${value}-01T00:00:00.000Z`) : undefined;
  }

  async findAll(page = 1, pageSize = 100, status?: UnitStatus, departmentId?: string) {
    const where: Prisma.UnitWhereInput = { deletedAt: null, ...(status ? { status } : {}), ...(departmentId ? { currentDepartmentId: departmentId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({ where, include: this.unitSummaryInclude(), orderBy: [{ productionMonth: 'asc' }, { priorityPosition: 'asc' }, { createdAt: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.unit.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async calendar(from?: string, to?: string) {
    const now = new Date();
    const start = from ? new Date(`${from}-01T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = to ? new Date(`${to}-01T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
    return this.prisma.unit.findMany({
      where: { deletedAt: null, OR: [{ productionMonth: { gte: start, lt: end } }, { productionMonth: null }] },
      include: this.unitSummaryInclude(),
      orderBy: [{ productionMonth: 'asc' }, { priorityPosition: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async directorSummary() {
    const units = await this.prisma.unit.findMany({ where: { deletedAt: null, status: { notIn: ['Completed', 'Dispatched'] } }, include: this.unitSummaryInclude(), orderBy: [{ isBlocked: 'desc' }, { dueDate: 'asc' }, { priorityPosition: 'asc' }] });
    return {
      totals: {
        active: units.length,
        blocked: units.filter((u) => u.isBlocked).length,
        awaitingRelease: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.AwaitingRelease).length,
        released: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Released).length,
        inProduction: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Started).length,
      },
      units,
    };
  }

  async managerSummary() {
    const units = await this.prisma.unit.findMany({
      where: { deletedAt: null, status: { notIn: ['Completed', 'Dispatched'] } },
      include: {
        ...this.unitSummaryInclude(),
        parts: {
          where: { deletedAt: null },
          include: {
            partType: true,
            tasks: {
              include: { department: true, processDefinition: true },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
      },
      orderBy: [{ productionReleaseStatus: 'asc' }, { productionMonth: 'asc' }, { priorityPosition: 'asc' }],
    });

    const enriched = units.map((unit) => {
      const departmentMap = new Map<string, { id: string; name: string; ready: number; inProgress: number; completed: number; waiting: number; parts: Array<{ id: string; identifier: string; partType: unknown; quantity: number; process: string; status: string }> }>();
      for (const part of unit.parts) {
        const visibleTask = part.tasks.find((task) => ['Ready', 'InProgress', 'PendingVerification', 'OnHold'].includes(task.status))
          ?? [...part.tasks].reverse().find((task) => task.status === 'Completed')
          ?? part.tasks.find((task) => task.status === 'Pending');
        if (!visibleTask) continue;
        const department = visibleTask.department;
        const entry = departmentMap.get(department.id) ?? { id: department.id, name: department.name, ready: 0, inProgress: 0, completed: 0, waiting: 0, parts: [] };
        if (visibleTask.status === 'Ready') entry.ready += 1;
        else if (['InProgress', 'PendingVerification', 'OnHold'].includes(visibleTask.status)) entry.inProgress += 1;
        else if (visibleTask.status === 'Completed') entry.completed += 1;
        else entry.waiting += 1;
        entry.parts.push({ id: part.id, identifier: part.identifier, partType: part.partType, quantity: part.quantity, process: visibleTask.processDefinition.name, status: visibleTask.status });
        departmentMap.set(department.id, entry);
      }
      return { ...unit, departmentProgress: [...departmentMap.values()] };
    });

    return {
      awaitingRelease: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.AwaitingRelease),
      released: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Released),
      started: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Started),
      blocked: enriched.filter((u) => u.isBlocked),
    };
  }

  async engineeringQueue() {
    return this.prisma.unit.findMany({ where: { deletedAt: null, status: { notIn: ['Completed', 'Dispatched'] } }, include: this.unitSummaryInclude(), orderBy: [{ productionMonth: 'asc' }, { priorityPosition: 'asc' }] });
  }

  async findByOrder(orderId: string, page = 1, pageSize = 25) {
    const where = { orderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({ where, include: this.unitSummaryInclude(), orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.unit.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id, deletedAt: null },
      include: {
        order: { include: { project: { include: { customer: true } }, priorityLevel: true } }, unitType: true, priorityLevel: true, currentDepartment: true,
        createdBy: { select: { id: true, name: true, email: true } },
        comments: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
        parts: { where: { deletedAt: null }, include: { partType: true, tasks: { include: { processDefinition: { include: { department: true } }, department: true, priorityLevel: true }, orderBy: { sequenceOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } },
        tasks: { include: { processDefinition: { include: { department: true } }, department: true, priorityLevel: true, assignedUser: { select: { id: true, name: true, email: true } } }, orderBy: { sequenceOrder: 'asc' } },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async createDirect(dto: CreateUnitDto, userId: string) {
    const priority = dto.priorityLevelId ? await this.prisma.priorityLevel.findUnique({ where: { id: dto.priorityLevelId } }) : await this.prisma.priorityLevel.findFirst({ where: { isDefault: true, isActive: true } });
    if (!priority) throw new BadRequestException('Configure a default priority level first');
    const unitType = await this.prisma.unitType.findUnique({ where: { id: dto.unitTypeId } });
    if (!unitType) throw new NotFoundException('Unit type not found');
    const composition = await this.prisma.unitTypeComposition.findMany({ where: { unitTypeId: dto.unitTypeId, isActive: true }, orderBy: { sortOrder: 'asc' } });
    const unit = await this.prisma.$transaction(async (tx) => {
      const newUnit = await tx.unit.create({ data: { unitTypeId: dto.unitTypeId, serialNumber: dto.serialNumber, displayName: dto.displayName, priorityLevelId: priority.id, productionMonth: this.monthValue(dto.productionMonth), dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, priorityPosition: dto.priorityPosition ?? 0, oneDriveFolderUrl: dto.oneDriveFolderUrl, specifications: dto.specifications as Prisma.InputJsonValue | undefined, currentStage: 'Engineering', createdByUserId: userId } });
      for (const comp of composition.filter((c) => !c.isOptional)) await this.createPartWithTasks(tx, newUnit.id, comp.partTypeId, comp.defaultQuantity, priority.id, userId);
      return newUnit;
    });
    return this.findOne(unit.id);
  }

  async create(orderId: string, dto: CreateUnitDto, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'Cancelled') throw new BadRequestException('Cannot add units to a cancelled order');
    const unit = await this.createDirect({ ...dto, priorityLevelId: order.priorityLevelId }, userId);
    await this.prisma.unit.update({ where: { id: unit.id }, data: { orderId } });
    return { unit: await this.findOne(unit.id), optionalParts: [] };
  }

  async move(id: string, dto: MoveUnitDto) {
    await this.findOne(id);
    return this.prisma.unit.update({ where: { id }, data: { productionMonth: this.monthValue(dto.productionMonth), priorityPosition: dto.priorityPosition }, include: this.unitSummaryInclude() });
  }

  async advanceEngineering(id: string) {
    const unit = await this.findOne(id);
    const currentIndex = ENGINEERING_SEQUENCE.indexOf(unit.engineeringStatus);
    if (currentIndex < 0 || currentIndex === ENGINEERING_SEQUENCE.length - 1) throw new ConflictException('Engineering workflow is already complete');
    const next = ENGINEERING_SEQUENCE[currentIndex + 1];
    return this.prisma.unit.update({ where: { id }, data: { engineeringStatus: next, currentStage: next === EngineeringStatus.ReleasedToManufacturing ? 'Awaiting production release' : 'Engineering' }, include: this.unitSummaryInclude() });
  }

  async releaseToProduction(id: string, userId: string) {
    const unit = await this.findOne(id);
    if (unit.engineeringStatus !== EngineeringStatus.ReleasedToManufacturing) throw new ConflictException('Engineering must be Released to Manufacturing before manager release');
    if (unit.isBlocked) throw new ConflictException('Remove the unit hold before release');
    if (unit.productionReleaseStatus !== ProductionReleaseStatus.AwaitingRelease) throw new ConflictException('Unit has already been released');
    const fabrication = await this.prisma.department.findFirst({
      where: { isActive: true, OR: [{ code: { equals: 'FAB', mode: 'insensitive' } }, { name: { equals: 'Fabrication', mode: 'insensitive' } }] },
    });
    if (!fabrication) throw new ConflictException('Create an active Fabrication department before releasing units');
    return this.prisma.unit.update({
      where: { id },
      data: {
        productionReleaseStatus: ProductionReleaseStatus.Released,
        releasedAt: new Date(),
        releasedByUserId: userId,
        currentDepartmentId: fabrication.id,
        currentStage: 'Waiting for Fabrication',
      },
      include: this.unitSummaryInclude(),
    });
  }

  async startManufacturing(id: string) {
    const unit = await this.findOne(id);
    if (unit.productionReleaseStatus !== ProductionReleaseStatus.Released) throw new ConflictException('Manager must release this unit before manufacturing can start');
    const firstTasks = unit.parts.map((part) => part.tasks.find((task) => task.status === TaskStatus.Pending)).filter(Boolean);
    await this.prisma.$transaction(async (tx) => {
      for (const task of firstTasks) await tx.productionTask.update({ where: { id: task!.id }, data: { status: TaskStatus.Ready } });
      const firstDepartmentId = firstTasks[0]?.departmentId ?? unit.currentDepartmentId;
      await tx.unit.update({ where: { id }, data: { productionReleaseStatus: ProductionReleaseStatus.Started, manufacturingStartedAt: new Date(), status: UnitStatus.InProgress, currentDepartmentId: firstDepartmentId, currentStage: firstTasks[0]?.processDefinition?.name ?? 'Manufacturing' } });
    });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateUnitDto) {
    await this.findOne(id);
    const data: Prisma.UnitUpdateInput = { serialNumber: dto.serialNumber, displayName: dto.displayName, status: dto.status, currentStage: dto.currentStage, isBlocked: dto.isBlocked, holdReason: dto.holdReason, oneDriveFolderUrl: dto.oneDriveFolderUrl, priorityPosition: dto.priorityPosition, productionMonth: dto.productionMonth ? this.monthValue(dto.productionMonth) : undefined, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, specifications: dto.specifications as Prisma.InputJsonValue | undefined, unitType: dto.unitTypeId ? { connect: { id: dto.unitTypeId } } : undefined, priorityLevel: dto.priorityLevelId ? { connect: { id: dto.priorityLevelId } } : undefined, currentDepartment: dto.currentDepartmentId ? { connect: { id: dto.currentDepartmentId } } : undefined };
    return this.prisma.unit.update({ where: { id }, data, include: this.unitSummaryInclude() });
  }

  async addComment(id: string, dto: AddUnitCommentDto, userId: string) { await this.findOne(id); return this.prisma.unitComment.create({ data: { unitId: id, userId, message: dto.message, isDelay: dto.isDelay ?? false }, include: { user: { select: { id: true, name: true, email: true } } } }); }
  async remove(id: string) { await this.findOne(id); const count = await this.prisma.productionTask.count({ where: { OR: [{ unitId: id }, { part: { unitId: id } }], status: { in: ['InProgress', 'PendingVerification'] } } }); if (count) throw new ConflictException('Cannot delete unit with tasks in progress'); return this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } }); }
  async getAllTasks(unitId: string) { await this.findOne(unitId); return this.prisma.productionTask.findMany({ where: { OR: [{ unitId }, { part: { unitId } }] }, include: { processDefinition: { include: { department: true } }, department: true, priorityLevel: true, assignedUser: { select: { id: true, name: true, email: true } }, part: { include: { partType: true } } }, orderBy: [{ part: { identifier: 'asc' } }, { sequenceOrder: 'asc' }] }); }

  private unitSummaryInclude(): Prisma.UnitInclude { return { unitType: true, priorityLevel: true, currentDepartment: true, _count: { select: { parts: { where: { deletedAt: null } }, comments: true } } }; }

  async createPartWithTasks(tx: Prisma.TransactionClient, unitId: string, partTypeId: string, quantity: number, priorityLevelId: string, userId: string) {
    const routes = await tx.processRoute.findMany({ where: { partTypeId, isActive: true }, include: { processDefinition: true }, orderBy: { sequenceOrder: 'asc' } });
    const part = await tx.part.create({ data: { unitId, partTypeId, identifier: `${partTypeId.slice(0, 4).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, quantity, createdByUserId: userId } });
    let previousTaskId: string | null = null;
    for (const route of routes) {
      const task: ProductionTask = await tx.productionTask.create({ data: { partId: part.id, departmentId: route.processDefinition.departmentId, processDefinitionId: route.processDefinitionId, sequenceOrder: route.sequenceOrder, status: TaskStatus.Pending, priorityLevelId: route.processDefinition.defaultPriorityLevelId ?? priorityLevelId, estimatedDurationMinutes: route.processDefinition.defaultEstimatedMinutes, parentTaskId: previousTaskId, createdByUserId: userId, updatedByUserId: userId } });
      if (previousTaskId) await tx.productionTask.update({ where: { id: previousTaskId }, data: { nextTaskId: task.id } });
      previousTaskId = task.id;
    }
    return part;
  }
}
