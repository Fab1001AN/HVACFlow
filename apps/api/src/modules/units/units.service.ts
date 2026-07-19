import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EngineeringStatus, Prisma, ProductionReleaseStatus, ProductionTask, UnitStatus, ActivityAction } from '@prisma/client';
import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID, IsUrl, Matches, Min } from 'class-validator';
import { TaskStatus } from '@hvacflow/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ActivityLogService } from '../activity-log/activity-log.module';

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

export class StartAssemblyDto {
  @IsString() teamName: string;
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
    private readonly activityLog: ActivityLogService,
  ) {}

  private monthValue(value?: string) {
    return value ? new Date(`${value}-01T00:00:00.000Z`) : undefined;
  }

  // Step 3a (shadow mode): stamps the new generic engine's position
  // field in parallel with the real, existing pipeline field changes
  // below - purely additive, nothing reads from currentWorkflowStageId
  // as the source of truth yet. Wrapped in try/catch and never awaited
  // in a way that could fail the real operation - if the named stage
  // doesn't exist yet (e.g. db:seed hasn't run against this database),
  // this silently no-ops rather than breaking unit creation/release/etc.
  private async shadowSetStage(unitId: string, stageName: string) {
    try {
      const stage = await this.prisma.workflowStage.findUnique({ where: { name: stageName } });
      if (stage) await this.prisma.unit.update({ where: { id: unitId }, data: { currentWorkflowStageId: stage.id } });
    } catch {
      // Deliberately swallowed - see comment above.
    }
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

  // Quick-jump search across every unit, not just the calendar's current
  // visible window - lets the UI find a unit by serial number/display
  // name and jump the calendar view straight to whatever month it's
  // actually scheduled in.
  async search(query: string) {
    if (!query.trim()) return [];
    return this.prisma.unit.findMany({
      where: {
        deletedAt: null,
        OR: [
          { serialNumber: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, serialNumber: true, displayName: true, productionMonth: true, unitType: { select: { name: true } } },
      orderBy: { serialNumber: 'asc' },
      take: 15,
    });
  }

  async directorSummary() {
    // Excludes units on a terminal stage via the admin-configurable
    // isTerminal flag (see activeUnitsWhere) - a shipped/finished unit
    // drops off the Director's active view without hardcoding which
    // stage name counts as "done".
    const units = await this.prisma.unit.findMany({
      where: this.activeUnitsWhere(),
      include: { ...this.unitSummaryInclude(), currentWorkflowStage: { select: { name: true, sortOrder: true } } },
      orderBy: [{ isBlocked: 'desc' }, { dueDate: 'asc' }, { priorityPosition: 'asc' }],
    });
    const now = new Date();

    // Surface the most recent "stuck" comment per unit to the Director.
    // Any department (e.g. Assembly) can already flag a comment as a
    // delay via isDelay on POST /units/:id/comments - that data existed
    // but was never actually shown anywhere outside the unit's own
    // detail page, so a director had no way to see it without opening
    // every unit individually.
    const latestDelayComments = await this.prisma.unitComment.findMany({
      where: { unitId: { in: units.map((u) => u.id) }, isDelay: true },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    const delayCommentByUnit = new Map<string, (typeof latestDelayComments)[number]>();
    for (const comment of latestDelayComments) {
      if (!delayCommentByUnit.has(comment.unitId)) delayCommentByUnit.set(comment.unitId, comment);
    }
    const unitsWithDelayFlag = units.map((u) => ({
      ...u,
      latestDelayComment: delayCommentByUnit.get(u.id)
        ? { message: delayCommentByUnit.get(u.id)!.message, userName: delayCommentByUnit.get(u.id)!.user.name, createdAt: delayCommentByUnit.get(u.id)!.createdAt }
        : null,
    }));

    // Department workload and the delayed/testing/readyToDispatch totals
    // were referenced by the Director Dashboard UI but never actually
    // computed here - the cards silently showed 0 and the workload panel
    // was always empty. Filling these in properly rather than leaving
    // dead frontend code pointed at nothing.
    const openTaskCounts = await this.prisma.productionTask.groupBy({
      by: ['departmentId'],
      where: { status: { in: ['Ready', 'InProgress', 'PendingVerification'] } },
      _count: { _all: true },
    });
    const departments = await this.prisma.department.findMany({
      where: { id: { in: openTaskCounts.map((row) => row.departmentId) } },
    });
    const departmentLoad = openTaskCounts
      .map((row) => ({
        departmentId: row.departmentId,
        openTasks: row._count._all,
        department: departments.find((d) => d.id === row.departmentId),
      }))
      .sort((a, b) => b.openTasks - a.openTasks);

    return {
      totals: {
        active: units.length,
        blocked: units.filter((u) => u.isBlocked).length,
        delayed: units.filter((u) => u.dueDate && u.dueDate < now).length,
        testing: units.filter((u) => {
          const name = u.currentDepartment?.name?.toLowerCase() ?? '';
          return name.includes('testing') || name.includes('quality');
        }).length,
        readyToDispatch: units.filter((u) => u.currentDepartment?.name?.toLowerCase() === 'dispatch').length,
        awaitingRelease: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.AwaitingRelease).length,
        released: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Released).length,
        inProduction: units.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Started).length,
      },
      units: unitsWithDelayFlag,
      departmentLoad,
    };
  }

  async managerSummary() {
    // The Production Manager's responsibility ends once a unit is past
    // Assembly Started - after that it's QC/dispatch's problem, not a
    // release-to-production concern. Previously this hardcoded the list
    // of "past assembly" stage names, which breaks the moment a
    // deployment renames or reorders stages. Instead we resolve the
    // Assembly-boundary stage's sortOrder at query time and exclude
    // anything at or beyond it (plus anything on a terminal stage).
    // "Assembly Started" is still referenced by name here as the manager
    // boundary, but only to look up its position - a renamed pipeline
    // that keeps an equivalent boundary stage can point this at whatever
    // it's called via a single constant.
    const MANAGER_BOUNDARY_STAGE = 'Assembly Started';
    const boundary = await this.prisma.workflowStage.findFirst({
      where: { name: MANAGER_BOUNDARY_STAGE },
      select: { sortOrder: true },
    });
    const units = await this.prisma.unit.findMany({
      where: this.activeUnitsWhere({
        OR: [
          { currentWorkflowStageId: null },
          { currentWorkflowStage: { isTerminal: false, ...(boundary ? { sortOrder: { lte: boundary.sortOrder } } : {}) } },
        ],
      }),
      include: {
        ...this.unitSummaryInclude(),
        currentWorkflowStage: { select: { name: true, sortOrder: true } },
        parts: {
          where: { deletedAt: null },
          include: {
            partType: true,
            tasks: {
              include: { department: true, processDefinition: true, updatedBy: { select: { id: true, name: true } } },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
      },
      orderBy: [{ productionReleaseStatus: 'asc' }, { productionMonth: 'asc' }, { priorityPosition: 'asc' }],
    });

    const enriched = units.map((unit) => {
      const departmentMap = new Map<string, { id: string; name: string; ready: number; inProgress: number; completed: number; waiting: number; parts: Array<{ id: string; taskId: string; identifier: string; partType: unknown; quantity: number; process: string; status: string; completedAt: Date | null; completedByName: string | null }> }>();
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
        entry.parts.push({
          id: part.id,
          taskId: visibleTask.id,
          identifier: part.identifier,
          partType: part.partType,
          quantity: part.quantity,
          process: visibleTask.processDefinition.name,
          status: visibleTask.status,
          // Who confirmed this step and when - updatedBy reflects
          // whoever last touched the task, which for a Completed task is
          // exactly whoever clicked Task Completed (set in
          // ProductionTasksService.complete()).
          completedAt: visibleTask.status === 'Completed' ? visibleTask.completedAt : null,
          completedByName: visibleTask.status === 'Completed' ? (visibleTask.updatedBy?.name ?? null) : null,
        });
        departmentMap.set(department.id, entry);
      }
      return { ...unit, departmentProgress: [...departmentMap.values()] };
    });

    return {
      // Renamed in meaning, not in JSON key (frontend already reads
      // `awaitingRelease` for the Manager's actionable queue) - now
      // means "Planner has finished and it's ready for the Production
      // Manager to release to Fabrication", not "not yet planned".
      awaitingRelease: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Planned),
      awaitingPlanning: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.AwaitingRelease && u.engineeringStatus === EngineeringStatus.ReleasedToManufacturing),
      released: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Released),
      started: enriched.filter((u) => u.productionReleaseStatus === ProductionReleaseStatus.Started),
      blocked: enriched.filter((u) => u.isBlocked),
    };
  }

  async engineeringQueue() {
    return this.prisma.unit.findMany({ where: this.activeUnitsWhere(), include: this.unitSummaryInclude(), orderBy: [{ productionMonth: 'asc' }, { priorityPosition: 'asc' }] });
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
      const newUnit = await tx.unit.create({ data: { unitTypeId: dto.unitTypeId, serialNumber: dto.serialNumber, displayName: dto.displayName, priorityLevelId: priority.id, productionMonth: this.monthValue(dto.productionMonth), dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, priorityPosition: dto.priorityPosition ?? 0, oneDriveFolderUrl: dto.oneDriveFolderUrl, specifications: dto.specifications as Prisma.InputJsonValue | undefined, currentStage: 'Detailing', createdByUserId: userId } });
      for (const comp of composition.filter((c) => !c.isOptional)) await this.createPartWithTasks(tx, newUnit.id, comp.partTypeId, comp.defaultQuantity, priority.id, userId);
      return newUnit;
    });
    await this.activityLog.log({
      unitId: unit.id,
      userId,
      action: ActivityAction.UnitCreated,
      description: `Unit ${unit.serialNumber} created`,
    });
    await this.shadowSetStage(unit.id, 'Detailing');
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

  async advanceEngineering(id: string, userId: string) {
    const unit = await this.findOne(id);
    const currentIndex = ENGINEERING_SEQUENCE.indexOf(unit.engineeringStatus);
    if (currentIndex < 0 || currentIndex === ENGINEERING_SEQUENCE.length - 1) throw new ConflictException('Engineering workflow is already complete');
    const next = ENGINEERING_SEQUENCE[currentIndex + 1];
    const updated = await this.prisma.unit.update({ where: { id }, data: { engineeringStatus: next, currentStage: next === EngineeringStatus.ReleasedToManufacturing ? 'Awaiting production release' : 'Detailing' }, include: this.unitSummaryInclude() });
    await this.activityLog.log({
      unitId: id,
      userId,
      action: ActivityAction.EngineeringAdvanced,
      description: `Engineering stage advanced to ${next}`,
    });
    if (next === EngineeringStatus.ReleasedToManufacturing) await this.shadowSetStage(id, 'Planning');
    return updated;
  }

  // Planner's queue: engineering-released units that haven't been marked
  // Planned yet. This is the "assign parts" stage that sits between
  // Engineering's release and the Production Manager's release-to-
  // Fabrication step.
  // Planner needs to see every active unit, not just the narrow subset
  // that's already past Engineering and waiting to be planned - they
  // need to work ahead, assigning parts to units that haven't even
  // finished Engineering yet. The "Release to Production Manager"
  // action itself still only makes sense (and is still validated
  // server-side in markPlanned()) once Engineering has actually
  // released the unit - the frontend shows that distinction rather
  // than hiding not-yet-eligible units entirely.
  async plannerQueue() {
    return this.prisma.unit.findMany({
      where: this.activeUnitsWhere(),
      include: { ...this.unitSummaryInclude(), parts: { where: { deletedAt: null }, include: { partType: true } } },
      orderBy: [{ dueDate: 'asc' }, { priorityPosition: 'asc' }],
    });
  }

  // Assembly's Upcoming/WIP view: WIP = Assembly has actually started
  // building (assemblyStartedAt set); Upcoming = already in production
  // but Assembly hasn't started yet - shown so Assembly can see what's
  // coming and what vendor parts are/aren't in yet. Every unit's own
  // Parts are inherently "from Fabrication" (VendorPart is a fully
  // separate table now), so no extra filtering needed there.
  async assemblySummary() {
    const include = {
      ...this.unitSummaryInclude(),
      parts: { where: { deletedAt: null }, include: { partType: true } },
      vendorParts: { include: { partType: true } },
      currentWorkflowStage: { select: { name: true, sortOrder: true } },
    };

    // assemblyStartedAt is set once, permanently, the moment Assembly
    // clicks "Start Building Unit" - it never gets cleared, so on its
    // own it can't tell "still being built" apart from "finished
    // Assembly ages ago and is now sitting in Testing or Dispatch".
    // We exclude units that have advanced past the Assembly boundary
    // stage by resolving that stage's sortOrder at query time rather
    // than hardcoding the downstream stage names - white-label safe.
    const ASSEMBLY_BOUNDARY_STAGE = 'Assembly Started';
    const boundary = await this.prisma.workflowStage.findFirst({
      where: { name: ASSEMBLY_BOUNDARY_STAGE },
      select: { sortOrder: true },
    });
    const notPastAssembly: Prisma.UnitWhereInput = {
      OR: [
        { currentWorkflowStageId: null },
        { currentWorkflowStage: boundary ? { sortOrder: { lte: boundary.sortOrder } } : { isTerminal: false } },
      ],
    };

    const [wip, upcoming] = await Promise.all([
      this.prisma.unit.findMany({
        where: this.activeUnitsWhere({ assemblyStartedAt: { not: null }, ...notPastAssembly }),
        include,
        orderBy: [{ dueDate: 'asc' }],
      }),
      this.prisma.unit.findMany({
        where: this.activeUnitsWhere({ assemblyStartedAt: null, productionReleaseStatus: ProductionReleaseStatus.Started }),
        include,
        orderBy: [{ dueDate: 'asc' }],
      }),
    ]);

    return { wip, upcoming };
  }

  async markPlanned(id: string, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { parts: { where: { deletedAt: null } } } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (unit.engineeringStatus !== EngineeringStatus.ReleasedToManufacturing) throw new ConflictException('Engineering must release this unit before it can be planned');
    if (unit.productionReleaseStatus !== ProductionReleaseStatus.AwaitingRelease) throw new ConflictException('Unit is already planned or released');
    if (unit.parts.length === 0) throw new ConflictException('Add at least one part before releasing to the Production Manager');
    const updated = await this.prisma.unit.update({
      where: { id },
      data: { productionReleaseStatus: ProductionReleaseStatus.Planned },
      include: this.unitSummaryInclude(),
    });
    await this.activityLog.log({
      unitId: id,
      userId,
      action: ActivityAction.UnitPlanned,
      description: `Parts assigned (${unit.parts.length}) and released to the Production Manager`,
    });
    await this.shadowSetStage(id, 'Manager Release');
    return updated;
  }

  async releaseToProduction(id: string, userId: string) {
    const unit = await this.findOne(id);
    if (unit.engineeringStatus !== EngineeringStatus.ReleasedToManufacturing) throw new ConflictException('Engineering must be Released to Manufacturing before manager release');
    if (unit.isBlocked) throw new ConflictException('Remove the unit hold before release');
    if (unit.productionReleaseStatus !== ProductionReleaseStatus.Planned) throw new ConflictException('The Planner must assign parts and release this unit before the Production Manager can release it');
    const fabrication = await this.prisma.department.findFirst({
      where: { isActive: true, OR: [{ code: { equals: 'FAB', mode: 'insensitive' } }, { name: { equals: 'Fabrication', mode: 'insensitive' } }] },
    });
    if (!fabrication) throw new ConflictException('Create an active Fabrication department before releasing units');
    const updated = await this.prisma.unit.update({
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
    await this.activityLog.log({
      unitId: id,
      userId,
      action: ActivityAction.UnitReleasedToProduction,
      description: `Released to Production - now waiting for ${fabrication.name}`,
    });
    // Shadow-set to Fabrication Started here too, not just in
    // startManufacturing() below - there's no separate "released but
    // not yet started" stage in this first 5-stage shadow set, so
    // "released to Fabrication" and "Fabrication actually started" are
    // deliberately collapsed into the same shadow stage for now. Fine
    // since nothing reads this yet; worth a real 6th stage if/when this
    // becomes the actual source of truth.
    await this.shadowSetStage(id, 'Fabrication Started');
    return updated;
  }

  async startManufacturing(id: string, userId: string) {
    const unit = await this.findOne(id);
    if (unit.productionReleaseStatus !== ProductionReleaseStatus.Released) throw new ConflictException('Manager must release this unit before manufacturing can start');
    const firstTasks = unit.parts.map((part) => part.tasks.find((task) => task.status === TaskStatus.Pending)).filter(Boolean);
    await this.prisma.$transaction(async (tx) => {
      for (const task of firstTasks) await tx.productionTask.update({ where: { id: task!.id }, data: { status: TaskStatus.Ready } });
      const firstDepartmentId = firstTasks[0]?.departmentId ?? unit.currentDepartmentId;
      await tx.unit.update({ where: { id }, data: { productionReleaseStatus: ProductionReleaseStatus.Started, manufacturingStartedAt: new Date(), status: UnitStatus.InProgress, currentDepartmentId: firstDepartmentId, currentStage: firstTasks[0]?.processDefinition?.name ?? 'Manufacturing' } });
    });
    await this.activityLog.log({
      unitId: id,
      userId,
      action: ActivityAction.ManufacturingStarted,
      description: 'Manufacturing started - first routed steps are ready',
    });
    await this.shadowSetStage(id, 'Fabrication Started');
    return this.findOne(id);
  }

  // Assembly's "Start Building Unit" - separate from startManufacturing
  // (which is Fabrication's kickoff). Captures the team name assigned to
  // the unit; doesn't gate on any particular upstream department having
  // finished, since parts can be arriving from multiple sources
  // (Fabrication tasks, vendor parts) concurrently by the time Assembly
  // is ready to begin.
  async startAssembly(id: string, teamName: string, userId: string) {
    const unit = await this.findOne(id);
    if (unit.assemblyStartedAt) throw new ConflictException('Assembly has already started for this unit');
    await this.prisma.unit.update({
      where: { id },
      data: { assignedTeamName: teamName, assemblyStartedAt: new Date() },
    });
    await this.activityLog.log({
      unitId: id,
      userId,
      action: ActivityAction.AssemblyStarted,
      description: `Assembly build started - team ${teamName}`,
    });
    await this.shadowSetStage(id, 'Assembly Started');
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateUnitDto, userId?: string) {
    const before = await this.findOne(id);
    const data: Prisma.UnitUpdateInput = { serialNumber: dto.serialNumber, displayName: dto.displayName, status: dto.status, currentStage: dto.currentStage, isBlocked: dto.isBlocked, holdReason: dto.holdReason, oneDriveFolderUrl: dto.oneDriveFolderUrl, priorityPosition: dto.priorityPosition, productionMonth: dto.productionMonth ? this.monthValue(dto.productionMonth) : undefined, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, specifications: dto.specifications as Prisma.InputJsonValue | undefined, unitType: dto.unitTypeId ? { connect: { id: dto.unitTypeId } } : undefined, priorityLevel: dto.priorityLevelId ? { connect: { id: dto.priorityLevelId } } : undefined, currentDepartment: dto.currentDepartmentId ? { connect: { id: dto.currentDepartmentId } } : undefined };
    const updated = await this.prisma.unit.update({ where: { id }, data, include: this.unitSummaryInclude() });
    if (dto.isBlocked !== undefined && dto.isBlocked !== before.isBlocked) {
      await this.activityLog.log({
        unitId: id,
        userId,
        action: dto.isBlocked ? ActivityAction.UnitBlocked : ActivityAction.UnitUnblocked,
        description: dto.isBlocked ? `Blocked${dto.holdReason ? `: ${dto.holdReason}` : ''}` : 'Hold removed',
      });
    }
    return updated;
  }

  async addComment(id: string, dto: AddUnitCommentDto, userId: string) {
    await this.findOne(id);
    const comment = await this.prisma.unitComment.create({ data: { unitId: id, userId, message: dto.message, isDelay: dto.isDelay ?? false }, include: { user: { select: { id: true, name: true, email: true } } } });
    if (dto.isDelay) {
      await this.activityLog.log({
        unitId: id,
        userId,
        action: ActivityAction.DelayReported,
        description: dto.message,
      });
    }
    return comment;
  }
  async remove(id: string) { await this.findOne(id); const count = await this.prisma.productionTask.count({ where: { OR: [{ unitId: id }, { part: { unitId: id } }], status: { in: ['InProgress', 'PendingVerification'] } } }); if (count) throw new ConflictException('Cannot delete unit with tasks in progress'); return this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } }); }
  async getAllTasks(unitId: string) { await this.findOne(unitId); return this.prisma.productionTask.findMany({ where: { OR: [{ unitId }, { part: { unitId } }] }, include: { processDefinition: { include: { department: true } }, department: true, priorityLevel: true, assignedUser: { select: { id: true, name: true, email: true } }, part: { include: { partType: true } } }, orderBy: [{ part: { identifier: 'asc' } }, { sequenceOrder: 'asc' }] }); }

  private unitSummaryInclude(): Prisma.UnitInclude { return { unitType: true, priorityLevel: true, currentDepartment: true, _count: { select: { parts: { where: { deletedAt: null } }, comments: true } } }; }

  // "Active" = not soft-deleted and not parked on a stage an admin has
  // flagged terminal. Excluding by the isTerminal flag rather than
  // hardcoded stage names keeps this white-label-safe: a deployment can
  // rename or restructure its end-of-line stages (Dispatch, Shipped,
  // Installed, whatever) and this still works with no code change. Note
  // we deliberately do NOT filter on unit.status here anymore - that
  // field is derived from task completion and flips to Completed at
  // assembly-done, long before the unit is actually finished shipping,
  // so it's not a reliable "is this unit done" signal on its own.
  private activeUnitsWhere(extra: Prisma.UnitWhereInput = {}): Prisma.UnitWhereInput {
    // Composed with AND so a caller passing its own OR (or anything else)
    // in `extra` can't accidentally clobber the terminal-stage guard -
    // spreading extra at the top level previously would have.
    return {
      deletedAt: null,
      AND: [
        {
          OR: [
            { currentWorkflowStageId: null },
            { currentWorkflowStage: { isTerminal: false } },
          ],
        },
        extra,
      ],
    };
  }

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
