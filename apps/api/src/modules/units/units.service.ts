import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TaskStatus } from '@hvacflow/shared-types';
import { IsString, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreateUnitDto {
  @IsUUID() unitTypeId: string;
  @IsString() serialNumber: string;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsObject() specifications?: Record<string, unknown>;
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowProgress: WorkflowProgressService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findByOrder(orderId: string, page = 1, pageSize = 25) {
    const where = { orderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: {
          unitType: true,
          _count: { select: { parts: { where: { deletedAt: null } } } },
        },
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
        parts: {
          where: { deletedAt: null },
          include: { partType: true },
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          include: {
            processDefinition: { include: { department: true } },
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

  async create(orderId: string, dto: CreateUnitDto, userId: string) {
    // Validate order exists and is not cancelled
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      include: { priorityLevel: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'Cancelled') throw new BadRequestException('Cannot add units to a cancelled order');

    // Get required parts composition for the unit type
    const composition = await this.prisma.unitTypeComposition.findMany({
      where: { unitTypeId: dto.unitTypeId, isActive: true },
      include: { partType: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Get unit-level process routes
    const unitRoutes = await this.prisma.processRoute.findMany({
      where: { unitTypeId: dto.unitTypeId, isActive: true },
      include: {
        processDefinition: {
          include: { department: true, defaultPriorityLevel: true },
        },
      },
      orderBy: { sequenceOrder: 'asc' },
    });

    // Create unit + all required parts + their tasks in a transaction
    const unit = await this.prisma.$transaction(async (tx) => {
      // Create the unit
      const newUnit = await tx.unit.create({
        data: {
          orderId,
          unitTypeId: dto.unitTypeId,
          serialNumber: dto.serialNumber,
          specifications: dto.specifications,
          createdByUserId: userId,
        },
      });

      // Create required parts and their tasks
      for (const comp of composition.filter((c) => !c.isOptional)) {
        await this.createPartWithTasks(tx, newUnit.id, comp.partTypeId, comp.defaultQuantity, order.priorityLevelId, userId);
      }

      // Create unit-level tasks (Testing, Dispatch, etc.)
      let previousTaskId: string | null = null;
      for (const route of unitRoutes) {
        const task = await tx.productionTask.create({
          data: {
            unitId: newUnit.id,
            departmentId: route.processDefinition.departmentId,
            processDefinitionId: route.processDefinitionId,
            sequenceOrder: route.sequenceOrder,
            status: TaskStatus.Pending,
            priorityLevelId: route.processDefinition.defaultPriorityLevelId ?? order.priorityLevelId,
            estimatedDurationMinutes: route.processDefinition.defaultEstimatedMinutes,
            parentTaskId: previousTaskId,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });

        // Update previous task's nextTaskId
        if (previousTaskId) {
          await tx.productionTask.update({
            where: { id: previousTaskId },
            data: { nextTaskId: task.id },
          });
        }

        previousTaskId = task.id;
      }

      return newUnit;
    });

    // Fetch and return full unit
    const fullUnit = await this.findOne(unit.id);

    // Emit realtime events for all created tasks
    const tasks = await this.prisma.productionTask.findMany({
      where: { unitId: unit.id },
      include: { processDefinition: true, priorityLevel: true, department: true },
    });
    for (const task of tasks) {
      this.realtime.emitTaskCreated(task.departmentId, { task: task as any });
    }

    return {
      unit: fullUnit,
      optionalParts: composition
        .filter((c) => c.isOptional)
        .map((c) => ({ partTypeId: c.partTypeId, partType: c.partType, defaultQuantity: c.defaultQuantity })),
    };
  }

  async update(id: string, dto: UpdateUnitDto) {
    await this.findOne(id);
    return this.prisma.unit.update({
      where: { id },
      data: dto,
      include: { unitType: true },
    });
  }

  async remove(id: string) {
    const unit = await this.findOne(id);
    const inProgressCount = await this.prisma.productionTask.count({
      where: { unitId: id, status: { in: ['InProgress', 'PendingVerification'] } },
    });
    if (inProgressCount > 0) {
      throw new ConflictException('Cannot delete unit with tasks in progress');
    }
    return this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getAllTasks(unitId: string) {
    await this.findOne(unitId);
    return this.prisma.productionTask.findMany({
      where: {
        OR: [
          { unitId },
          { part: { unitId } },
        ],
      },
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

  /** Helper: create a part and all its tasks from ProcessRoute */
  async createPartWithTasks(
    tx: any,
    unitId: string,
    partTypeId: string,
    quantity: number,
    priorityLevelId: string,
    userId: string,
  ) {
    // Get part type routes
    const routes = await tx.processRoute.findMany({
      where: { partTypeId, isActive: true },
      include: {
        processDefinition: {
          include: { department: true, defaultPriorityLevel: true },
        },
      },
      orderBy: { sequenceOrder: 'asc' },
    });

    const part = await tx.part.create({
      data: {
        unitId,
        partTypeId,
        identifier: `${partTypeId.slice(0, 4).toUpperCase()}-${Date.now()}`,
        quantity,
        createdByUserId: userId,
      },
    });

    // Create tasks in sequence
    let previousTaskId: string | null = null;
    let firstTaskId: string | null = null;

    for (const route of routes) {
      const task = await tx.productionTask.create({
        data: {
          partId: part.id,
          departmentId: route.processDefinition.departmentId,
          processDefinitionId: route.processDefinitionId,
          sequenceOrder: route.sequenceOrder,
          status: previousTaskId ? TaskStatus.Pending : TaskStatus.Ready, // First task starts as Ready
          priorityLevelId: route.processDefinition.defaultPriorityLevelId ?? priorityLevelId,
          estimatedDurationMinutes: route.processDefinition.defaultEstimatedMinutes,
          parentTaskId: previousTaskId,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });

      if (!firstTaskId) firstTaskId = task.id;

      if (previousTaskId) {
        await tx.productionTask.update({
          where: { id: previousTaskId },
          data: { nextTaskId: task.id },
        });
      }

      previousTaskId = task.id;
    }

    return part;
  }
}
