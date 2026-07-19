import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowProgressService } from '../workflow-progress/workflow-progress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChecklistsService } from '../checklists/checklists.service';
import { ActivityLogService } from '../activity-log/activity-log.module';
import { ActivityAction } from '@prisma/client';
import { TaskStatus } from '@hvacflow/shared-types';
import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';

export class QueryTasksDto {
  departmentId?: string;
  status?: TaskStatus;
  priorityLevelId?: string;
  processDefinitionId?: string;
  assignedUserId?: string;
  mine?: boolean;
  unitId?: string;
  partId?: string;
  page?: number;
  pageSize?: number;
}

export class UpdateTaskDto {
  @IsOptional() @IsUUID() priorityLevelId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() estimatedDurationMinutes?: number;
  @IsOptional() @IsString() notes?: string;
}

export class TaskActionDto {
  @IsOptional() @IsString() note?: string;
}

// Valid status transitions — enforced by the engine
const VALID_TRANSITIONS: Record<string, TaskStatus[]> = {
  [TaskStatus.Ready]: [TaskStatus.InProgress, TaskStatus.OnHold],
  [TaskStatus.InProgress]: [TaskStatus.PendingVerification, TaskStatus.Completed, TaskStatus.OnHold, TaskStatus.Rejected],
  [TaskStatus.PendingVerification]: [TaskStatus.Completed, TaskStatus.Rejected],
  [TaskStatus.OnHold]: [TaskStatus.Ready, TaskStatus.InProgress],
  [TaskStatus.Completed]: [],
  [TaskStatus.Rejected]: [],
  [TaskStatus.Pending]: [],
};

@Injectable()
export class ProductionTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowProgress: WorkflowProgressService,
    private readonly realtime: RealtimeGateway,
    private readonly checklists: ChecklistsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async findAll(query: QueryTasksDto, callerDeptIds: string[], hasViewAll: boolean) {
    const {
      departmentId, status, priorityLevelId, processDefinitionId,
      assignedUserId, mine, unitId, partId,
      page = 1, pageSize = 50,
    } = query;

    // Department scope: restrict to caller's departments unless they have task:view-all
    const deptFilter = hasViewAll
      ? departmentId ? [departmentId] : undefined
      : departmentId
      ? callerDeptIds.filter((d) => d === departmentId)
      : callerDeptIds;

    const where: any = {
      ...(deptFilter ? { departmentId: { in: deptFilter } } : {}),
      ...(status ? { status } : { status: { not: TaskStatus.Pending } }), // Hide Pending from default list
      ...(priorityLevelId ? { priorityLevelId } : {}),
      ...(processDefinitionId ? { processDefinitionId } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(unitId ? { OR: [{ unitId }, { part: { unitId } }] } : {}),
      ...(partId ? { partId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.productionTask.findMany({
        where,
        include: this.taskIncludes(),
        orderBy: [
          { priorityLevel: { sortOrder: 'desc' } },
          { sequenceOrder: 'asc' },
          { createdAt: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productionTask.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const task = await this.prisma.productionTask.findUnique({
      where: { id },
      include: {
        ...this.taskIncludes(),
        checklistResponses: {
          include: { checklistItemTemplate: true },
          orderBy: { checklistItemTemplate: { sortOrder: 'asc' } },
        },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true, email: true } } },
          orderBy: { changedAt: 'asc' },
        },
        parentTask: { select: { id: true, status: true, processDefinition: { select: { name: true } } } },
        nextTask: { select: { id: true, status: true, processDefinition: { select: { name: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Production task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, userId: string) {
    const task = await this.findOne(id);
    const updated = await this.prisma.productionTask.update({
      where: { id },
      data: { ...dto, updatedByUserId: userId },
      include: this.taskIncludes(),
    });
    this.realtime.emitTaskUpdated(updated.departmentId, id, { taskId: id, task: updated as any });
    return updated;
  }

  /** START: Ready → InProgress */
  async start(id: string, userId: string, dto: TaskActionDto) {
    const task = await this.assertTransition(id, TaskStatus.InProgress);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: {
          status: TaskStatus.InProgress,
          startedAt: now,
          assignedUserId: task.assignedUserId ?? userId,
          updatedByUserId: userId,
        },
        include: this.taskIncludes(),
      });

      await this.recordHistory(tx, id, task.status, TaskStatus.InProgress, userId, dto.note);

      // Instantiate checklist if required
      if (task.processDefinition.requiresChecklist) {
        await this.checklists.instantiateForTask(id, task.processDefinitionId);
      }

      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: TaskStatus.InProgress,
      task: updated as any,
    });

    return updated;
  }

  /** COMPLETE: InProgress → PendingVerification OR Completed */
  async complete(id: string, userId: string, dto: TaskActionDto) {
    const task = await this.findOne(id);

    if (task.status !== TaskStatus.Ready && task.status !== TaskStatus.InProgress) {
      throw new ConflictException(`Task is ${task.status}, expected Ready or InProgress`);
    }

    // Validate checklist completion
    if (task.processDefinition.requiresChecklist) {
      const completion = await this.checklists.checkCompletion(id);
      if (!completion.allRequiredComplete) {
        throw new UnprocessableEntityException(
          `${completion.checkedRequired}/${completion.required} required checklist items complete`,
        );
      }
    }

    const now = new Date();
    const startedAt = task.startedAt ?? now;
    const actualDurationMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60000);

    const nextStatus = task.processDefinition.requiresVerification
      ? TaskStatus.PendingVerification
      : TaskStatus.Completed;

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: {
          status: nextStatus,
          completedAt: now,
          actualDurationMinutes,
          updatedByUserId: userId,
        },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, task.status, nextStatus, userId, dto.note);
      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: nextStatus,
      task: updated as any,
    });

    // If fully completed (no verification needed), cascade and recompute
    if (nextStatus === TaskStatus.Completed) {
      await this.onTaskCompleted(updated);
      const unitId = updated.unitId ?? updated.part?.unitId;
      if (unitId) {
        await this.activityLog.log({
          unitId,
          userId,
          action: ActivityAction.TaskCompleted,
          description: `${updated.processDefinition.name} completed${updated.part ? ` on ${updated.part.partType?.name ?? updated.part.identifier}` : ''}`,
        });
      }
    }

    return updated;
  }

  /** VERIFY: PendingVerification → Completed */
  async verify(id: string, userId: string, dto: TaskActionDto) {
    const task = await this.assertTransition(id, TaskStatus.Completed, TaskStatus.PendingVerification);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: {
          status: TaskStatus.Completed,
          verifiedAt: now,
          verifiedByUserId: userId,
          updatedByUserId: userId,
        },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, task.status, TaskStatus.Completed, userId, dto.note);
      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: TaskStatus.Completed,
      task: updated as any,
    });

    await this.onTaskCompleted(updated);
    const unitId = updated.unitId ?? updated.part?.unitId;
    if (unitId) {
      await this.activityLog.log({
        unitId,
        userId,
        action: ActivityAction.TaskCompleted,
        description: `${updated.processDefinition.name} verified and completed${updated.part ? ` on ${updated.part.partType?.name ?? updated.part.identifier}` : ''}`,
      });
    }
    return updated;
  }

  /** HOLD: active status → OnHold */
  async hold(id: string, userId: string, dto: TaskActionDto & { note: string }) {
    if (!dto.note?.trim()) throw new BadRequestException('A note is required when placing a task on hold');

    const task = await this.findOne(id);
    const validFrom: TaskStatus[] = [TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification];
    if (!validFrom.includes(task.status)) {
      throw new ConflictException(`Cannot hold task with status ${task.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: { status: TaskStatus.OnHold, updatedByUserId: userId },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, task.status, TaskStatus.OnHold, userId, dto.note);
      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: TaskStatus.OnHold,
      task: updated as any,
    });

    return updated;
  }

  /** RESUME: OnHold → previous active status (read from history) */
  async resume(id: string, userId: string, dto: TaskActionDto) {
    const task = await this.assertTransition(id, TaskStatus.InProgress, TaskStatus.OnHold);

    // Find previous status from history
    const lastHistory = await this.prisma.taskStatusHistory.findFirst({
      where: { productionTaskId: id, toStatus: TaskStatus.OnHold },
      orderBy: { changedAt: 'desc' },
    });

    const resumeStatus = lastHistory?.fromStatus === TaskStatus.InProgress
      ? TaskStatus.InProgress
      : TaskStatus.Ready;

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: { status: resumeStatus, updatedByUserId: userId },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, TaskStatus.OnHold, resumeStatus, userId, dto.note);
      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: TaskStatus.OnHold,
      toStatus: resumeStatus,
      task: updated as any,
    });

    return updated;
  }

  /** REJECT: active → Rejected */
  async reject(id: string, userId: string, dto: TaskActionDto & { note: string }) {
    if (!dto.note?.trim()) throw new BadRequestException('A note is required when rejecting a task');

    const task = await this.findOne(id);
    const validFrom: TaskStatus[] = [TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification, TaskStatus.OnHold];
    if (!validFrom.includes(task.status)) {
      throw new ConflictException(`Cannot reject task with status ${task.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: { status: TaskStatus.Rejected, updatedByUserId: userId },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, task.status, TaskStatus.Rejected, userId, dto.note);
      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: TaskStatus.Rejected,
      task: updated as any,
    });

    // Recompute progress (rejected task affects progress)
    await this.recomputeAndEmit(updated);

    return updated;
  }

  // REOPEN: a previously-completed task back to Ready so its work can be
  // redone (e.g. QC found a defect after the unit finished). Because the
  // task sequence is a nextTaskId chain, reopening one task mid-sequence
  // would otherwise leave a Ready task followed by still-Completed
  // downstream tasks - an inconsistent chain. So we cascade: the target
  // goes to Ready, and every task after it in the same chain that was
  // already Completed/PendingVerification is reset to Pending. They
  // re-activate to Ready naturally as the reopened work is completed
  // again (via the normal onTaskCompleted -> activateNextTask flow).
  // Requires a note - this is exactly the kind of correction that needs a
  // paper trail. Same permission weight as reject (task:reject).
  async reopen(id: string, userId: string, dto: TaskActionDto & { note: string }) {
    if (!dto.note?.trim()) throw new BadRequestException('A note is required when reopening a task');

    const task = await this.findOne(id);
    if (task.status !== TaskStatus.Completed && task.status !== TaskStatus.PendingVerification) {
      throw new ConflictException(`Only a completed task can be reopened - this task is ${task.status}`);
    }

    // Walk the nextTaskId chain forward from the target, collecting
    // downstream tasks that need resetting. Bounded by the chain length,
    // with a visited guard against any accidental cycle.
    const downstream: string[] = [];
    const visited = new Set<string>([id]);
    let cursor: string | null = task.nextTaskId ?? null;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const next = await this.prisma.productionTask.findUnique({
        where: { id: cursor },
        select: { id: true, status: true, nextTaskId: true },
      });
      if (!next) break;
      // Only reset tasks that had progressed; leave anything still Pending
      // (never started) exactly as it is.
      if (next.status === TaskStatus.Completed || next.status === TaskStatus.PendingVerification || next.status === TaskStatus.InProgress || next.status === TaskStatus.Ready) {
        downstream.push(next.id);
      }
      cursor = next.nextTaskId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.productionTask.update({
        where: { id },
        data: {
          status: TaskStatus.Ready,
          completedAt: null,
          verifiedAt: null,
          verifiedByUserId: null,
          updatedByUserId: userId,
        },
        include: this.taskIncludes(),
      });
      await this.recordHistory(tx, id, task.status, TaskStatus.Ready, userId, dto.note);

      for (const downId of downstream) {
        const prev = await tx.productionTask.findUnique({ where: { id: downId }, select: { status: true } });
        await tx.productionTask.update({
          where: { id: downId },
          data: {
            status: TaskStatus.Pending,
            completedAt: null,
            verifiedAt: null,
            verifiedByUserId: null,
            startedAt: null,
            updatedByUserId: userId,
          },
        });
        if (prev) await this.recordHistory(tx, downId, prev.status, TaskStatus.Pending, userId, `Reset because upstream task "${updated.processDefinition.name}" was reopened`);
      }

      return t;
    });

    this.realtime.emitTaskStatusChanged(updated.departmentId, id, {
      taskId: id,
      fromStatus: task.status,
      toStatus: TaskStatus.Ready,
      task: updated as any,
    });
    for (const downId of downstream) {
      const d = await this.prisma.productionTask.findUnique({ where: { id: downId }, include: this.taskIncludes() });
      if (d) {
        this.realtime.emitTaskStatusChanged(d.departmentId, downId, {
          taskId: downId,
          fromStatus: TaskStatus.Completed,
          toStatus: TaskStatus.Pending,
          task: d as any,
        });
      }
    }

    const unitId = updated.unitId ?? updated.part?.unitId;
    if (unitId) {
      await this.activityLog.log({
        unitId,
        userId,
        action: ActivityAction.TaskReopened,
        description: `${updated.processDefinition.name} reopened${updated.part ? ` on ${updated.part.partType?.name ?? updated.part.identifier}` : ''}${downstream.length ? ` (${downstream.length} downstream task(s) reset)` : ''} - ${dto.note}`,
      });
    }

    // Reopened work drops the unit's progress and status back from
    // Completed - recompute so dashboards and the status badge reflect
    // that the unit is active again.
    await this.recomputeAndEmit(updated);

    return updated;
  }

  async getHistory(id: string) {
    await this.findOne(id);
    return this.prisma.taskStatusHistory.findMany({
      where: { productionTaskId: id },
      include: { changedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  async toggleChecklistItem(taskId: string, responseId: string, isChecked: boolean, userId: string) {
    const task = await this.findOne(taskId);
    if (task.status !== TaskStatus.InProgress) {
      throw new ConflictException('Can only update checklist items on in-progress tasks');
    }

    const completion = await this.checklists.toggleResponse(taskId, responseId, isChecked, userId);

    this.realtime.emitChecklistUpdated(taskId, {
      taskId,
      checklistResponseId: responseId,
      isChecked,
      completionSummary: completion,
    });

    return completion;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertTransition(id: string, to: TaskStatus, expectedFrom?: TaskStatus) {
    const task = await this.findOne(id);
    const from = expectedFrom ?? task.status;

    if (expectedFrom && task.status !== expectedFrom) {
      throw new ConflictException(`Task is ${task.status}, expected ${expectedFrom}`);
    }

    if (!VALID_TRANSITIONS[task.status]?.includes(to)) {
      throw new ConflictException(`Cannot transition task from ${task.status} to ${to}`);
    }

    return task;
  }

  private async recordHistory(
    tx: any,
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    userId: string,
    note?: string,
  ) {
    return tx.taskStatusHistory.create({
      data: { productionTaskId: taskId, fromStatus: from, toStatus: to, changedByUserId: userId, note },
    });
  }

  private async onTaskCompleted(task: any) {
    // 1. Activate next task
    const nextTaskId = await this.workflowProgress.activateNextTask(task.id);

    if (nextTaskId) {
      const nextTask = await this.prisma.productionTask.findUnique({
        where: { id: nextTaskId },
        include: this.taskIncludes(),
      });
      if (nextTask) {
        const unitId = nextTask.unitId ?? nextTask.part?.unitId;
        if (unitId) {
          await this.prisma.unit.update({
            where: { id: unitId },
            data: { currentDepartmentId: nextTask.departmentId, currentStage: nextTask.processDefinition.name },
          });
        }
        this.realtime.emitTaskStatusChanged(nextTask.departmentId, nextTaskId, {
          taskId: nextTaskId,
          fromStatus: TaskStatus.Pending,
          toStatus: TaskStatus.Ready,
          task: nextTask as any,
        });
      }
    }

    // 2. Recompute progress
    await this.recomputeAndEmit(task);
  }

  private async recomputeAndEmit(task: any) {
    if (task.partId) {
      const part = await this.workflowProgress.recomputePart(task.partId);
      this.realtime.emitPartProgressChanged(task.part?.unitId ?? '', {
        partId: task.partId,
        progressPercentage: Number(part.progressPercentage),
        status: part.status,
      });

      const unit = await this.workflowProgress.recomputeUnit(task.part?.unitId ?? part.unitId);
      this.realtime.emitUnitProgressChanged(unit.id, {
        unitId: unit.id,
        progressPercentage: Number(unit.progressPercentage),
        status: unit.status,
      });
    } else if (task.unitId) {
      const unit = await this.workflowProgress.recomputeUnit(task.unitId);
      this.realtime.emitUnitProgressChanged(unit.id, {
        unitId: unit.id,
        progressPercentage: Number(unit.progressPercentage),
        status: unit.status,
      });
    }
  }

  private taskIncludes() {
    return {
      processDefinition: { include: { department: true } },
      department: true,
      priorityLevel: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      verifiedByUser: { select: { id: true, name: true, email: true } },
      machine: true,
      part: { include: { partType: true, unit: { include: { order: true } } } },
      unit: { include: { order: true, unitType: true } },
    };
  }
}
