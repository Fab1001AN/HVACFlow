import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus, PartStatus, UnitStatus } from '@hvacflow/shared-types';

/**
 * WorkflowProgressService
 *
 * The single source of truth for all progress calculations.
 * Part and Unit progress/status are ALWAYS computed from task state —
 * never set directly by any API consumer.
 *
 * This service is called by the ProductionTasksService after every
 * task state transition and writes back cached values for fast reads.
 */
@Injectable()
export class WorkflowProgressService {
  private readonly logger = new Logger(WorkflowProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute and persist Part progress + status.
   * Returns the updated Part record.
   */
  async recomputePart(partId: string) {
    const tasks = await this.prisma.productionTask.findMany({
      where: { partId },
      include: { processDefinition: { select: { weight: true } } },
    });

    if (tasks.length === 0) {
      return this.prisma.part.update({
        where: { id: partId },
        data: { progressPercentage: 0, status: 'Pending' },
      });
    }

    const totalWeight = tasks.reduce(
      (sum, t) => sum + Number(t.processDefinition.weight),
      0,
    );

    const completedWeight = tasks
      .filter((t) => t.status === TaskStatus.Completed)
      .reduce((sum, t) => sum + Number(t.processDefinition.weight), 0);

    const progressPercentage =
      totalWeight > 0
        ? Math.min(100, Math.round((completedWeight / totalWeight) * 100 * 100) / 100)
        : 0;

    const status = this.derivePartStatus(tasks.map((t) => t.status));

    const updated = await this.prisma.part.update({
      where: { id: partId },
      data: { progressPercentage, status },
    });

    this.logger.verbose(`Part ${partId} → ${status} ${progressPercentage}%`);
    return updated;
  }

  /**
   * Recompute and persist Unit progress + status from all its parts
   * and any unit-level tasks.
   */
  async recomputeUnit(unitId: string) {
    const [parts, unitTasks] = await Promise.all([
      this.prisma.part.findMany({
        where: { unitId, deletedAt: null },
        select: { progressPercentage: true, status: true, quantity: true },
      }),
      this.prisma.productionTask.findMany({
        where: { unitId },
        include: { processDefinition: { select: { weight: true } } },
      }),
    ]);

    let progressPercentage = 0;

    if (parts.length === 0 && unitTasks.length === 0) {
      progressPercentage = 0;
    } else {
      // Weight parts by quantity
      const totalPartWeight = parts.reduce((sum, p) => sum + p.quantity, 0);
      const partContribution = parts.reduce(
        (sum, p) => sum + (Number(p.progressPercentage) / 100) * p.quantity,
        0,
      );

      // Unit-level task contribution
      const totalUnitTaskWeight = unitTasks.reduce(
        (sum, t) => sum + Number(t.processDefinition.weight),
        0,
      );
      const completedUnitTaskWeight = unitTasks
        .filter((t) => t.status === TaskStatus.Completed)
        .reduce((sum, t) => sum + Number(t.processDefinition.weight), 0);

      const totalWeight = totalPartWeight + totalUnitTaskWeight;

      if (totalWeight > 0) {
        progressPercentage = Math.min(
          100,
          Math.round(
            ((partContribution + completedUnitTaskWeight / (totalUnitTaskWeight || 1) * totalUnitTaskWeight) / totalWeight) * 100 * 100,
          ) / 100,
        );
        // Simplified: weighted average
        const partProgress = totalPartWeight > 0 ? (partContribution / totalPartWeight) * totalPartWeight : 0;
        const taskProgress = totalUnitTaskWeight > 0 ? completedUnitTaskWeight : 0;
        progressPercentage = Math.min(
          100,
          Math.round(((partProgress + taskProgress) / totalWeight) * 100 * 100) / 100,
        );
      }
    }

    const allStatuses = [
      ...parts.map((p) => p.status),
      ...unitTasks.map((t) => t.status),
    ];

    const status = this.deriveUnitStatus(allStatuses, progressPercentage);

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { progressPercentage, status },
    });

    this.logger.verbose(`Unit ${unitId} → ${status} ${progressPercentage}%`);
    return updated;
  }

  /**
   * Activate the next task in the sequence after the given task completes.
   * Checks that all prerequisites (parent tasks) are Completed before activating.
   */
  async activateNextTask(completedTaskId: string): Promise<string | null> {
    const completedTask = await this.prisma.productionTask.findUnique({
      where: { id: completedTaskId },
      select: { nextTaskId: true },
    });

    if (!completedTask?.nextTaskId) return null;

    const nextTask = await this.prisma.productionTask.findUnique({
      where: { id: completedTask.nextTaskId },
      select: { id: true, status: true, parentTaskId: true },
    });

    if (!nextTask || nextTask.status !== TaskStatus.Pending) return null;

    // Verify the parent task is complete (handles multi-parent scenarios)
    if (nextTask.parentTaskId) {
      const parent = await this.prisma.productionTask.findUnique({
        where: { id: nextTask.parentTaskId },
        select: { status: true },
      });
      if (parent?.status !== TaskStatus.Completed) return null;
    }

    await this.prisma.productionTask.update({
      where: { id: nextTask.id },
      data: { status: TaskStatus.Ready },
    });

    this.logger.verbose(`Task ${nextTask.id} → Ready`);
    return nextTask.id;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private derivePartStatus(taskStatuses: string[]): PartStatus {
    if (taskStatuses.length === 0) return PartStatus.Pending;
    if (taskStatuses.every((s) => s === TaskStatus.Completed)) return PartStatus.Completed;
    if (taskStatuses.some((s) => s === TaskStatus.Rejected)) return PartStatus.Rejected;
    if (taskStatuses.some((s) => s === TaskStatus.OnHold) && !taskStatuses.some((s) => s === TaskStatus.InProgress)) return PartStatus.OnHold;
    if (taskStatuses.some((s) => s === TaskStatus.InProgress || s === TaskStatus.PendingVerification)) return PartStatus.InProgress;
    if (taskStatuses.some((s) => s === TaskStatus.Ready)) return PartStatus.InProgress;
    return PartStatus.Pending;
  }

  private deriveUnitStatus(allStatuses: string[], progress: number): UnitStatus {
    if (allStatuses.length === 0) return UnitStatus.Planned;
    if (allStatuses.every((s) => s === TaskStatus.Completed || s === PartStatus.Completed)) {
      return UnitStatus.Dispatched; // All done including dispatch
    }
    if (progress === 100) return UnitStatus.Completed;
    if (allStatuses.some((s) => s === TaskStatus.OnHold || s === PartStatus.OnHold)) return UnitStatus.OnHold;
    if (progress > 0) return UnitStatus.InProgress;
    return UnitStatus.Planned;
  }
}
