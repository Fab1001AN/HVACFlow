import { Injectable, Controller, Get, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload, TaskStatus, UnitStatus } from '@hvacflow/shared-types';
import { EngineeringStatus } from '@prisma/client';

// Engineering/Detailing's progress (Submittal Received, Design
// Completed, etc.) is tracked entirely on Unit.engineeringStatus - it
// never creates a real ProductionTask, because there's no process
// route for it the way Fabrication/Assembly/etc. have. That means its
// department column here was always empty, even though real work is
// clearly happening - clicking "Mark Submittal Received" on the
// Engineering Dashboard did something, just nothing that ever showed
// up on the shared board. Synthesized entries below give it real
// visibility without requiring a much larger rework of the engineering
// workflow into the task system.
const ENGINEERING_STAGE_LABELS: Partial<Record<EngineeringStatus, string>> = {
  [EngineeringStatus.SubmittalReceived]: 'Submittal Received',
  [EngineeringStatus.DesigningStarted]: 'Designing',
  [EngineeringStatus.UnitDesignCompleted]: 'Design Completed',
  [EngineeringStatus.DrawingsCompleted]: 'Drawings Completed',
  [EngineeringStatus.ProgrammingCompleted]: 'Programming Completed',
};

@Injectable()
export class MissionControlService {
  constructor(private readonly prisma: PrismaService) {}

  private async getEngineeringStageEntries() {
    const units = await this.prisma.unit.findMany({
      where: {
        deletedAt: null,
        // NotStarted hasn't had a button pressed yet - nothing to show.
        // ReleasedToManufacturing has moved on to Fabrication already.
        engineeringStatus: { notIn: [EngineeringStatus.NotStarted, EngineeringStatus.ReleasedToManufacturing] },
      },
      include: {
        unitType: true,
        priorityLevel: true,
        order: { include: { project: { include: { customer: { select: { name: true } } } } } },
      },
      orderBy: [{ priorityLevel: { sortOrder: 'desc' } }, { dueDate: 'asc' }],
    });

    return units.map((unit) => ({
      id: `engineering-${unit.id}`,
      status: TaskStatus.InProgress,
      processDefinition: { name: ENGINEERING_STAGE_LABELS[unit.engineeringStatus] ?? unit.engineeringStatus },
      priorityLevel: unit.priorityLevel,
      assignedUser: null,
      machine: null,
      part: null,
      unit,
      // Not a real task - clicking through to a task drawer would fail
      // (no ProductionTask with this id exists). Flagged so the
      // frontend can route a click to the unit page instead.
      isSynthetic: true,
    }));
  }

  async getBoard(
    callerDeptIds: string[],
    hasViewAll: boolean,
    filters: {
      departmentId?: string;
      priorityLevelId?: string;
      processDefinitionId?: string;
      mine?: boolean;
      userId?: string;
    },
  ) {
    // Determine which departments to show
    const effectiveDeptIds = hasViewAll
      ? undefined // all departments
      : callerDeptIds;

    // An explicit ?departmentId= filter must narrow within the caller's
    // allowed departments, never replace that restriction - previously
    // both conditions spread the same `id` key into one where object,
    // so the filter silently overrode the permission check entirely: a
    // department-scoped user could request any other department's board
    // just by passing its id in the query string.
    let allowedDeptIds: string[] | undefined = effectiveDeptIds;
    if (filters.departmentId) {
      if (!allowedDeptIds || allowedDeptIds.includes(filters.departmentId)) {
        allowedDeptIds = [filters.departmentId];
      } else {
        allowedDeptIds = []; // requested a department outside their scope - show nothing, don't leak it
      }
    }

    // Load departments in sorted order (Kanban column order)
    const departments = await this.prisma.department.findMany({
      where: {
        isActive: true,
        ...(allowedDeptIds ? { id: { in: allowedDeptIds } } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });

    const activeStatuses = [
      TaskStatus.Ready,
      TaskStatus.InProgress,
      TaskStatus.PendingVerification,
      TaskStatus.OnHold,
    ];

    // Fetched once outside the per-department loop since it's not
    // filtered by departmentId the same way real tasks are. Skipped
    // entirely if Detailing isn't even in the current department list
    // (e.g. viewing a single other department) - no point querying it.
    const engineeringEntries = departments.some((d) => d.code === 'ENG')
      ? await this.getEngineeringStageEntries()
      : [];

    // Build Kanban columns in parallel
    const columns = await Promise.all(
      departments.map(async (dept) => {
        const where: any = {
          departmentId: dept.id,
          status: { in: activeStatuses },
          // Don't surface tasks whose unit was cancelled (its order was
          // cancelled). A task links to its unit either directly (unitId)
          // or through its part (part.unit) - exclude cancelled via both
          // paths so cancelled work leaves the shop floor.
          NOT: {
            OR: [
              { unit: { status: UnitStatus.Cancelled } },
              { part: { unit: { status: UnitStatus.Cancelled } } },
            ],
          },
          ...(filters.priorityLevelId ? { priorityLevelId: filters.priorityLevelId } : {}),
          ...(filters.processDefinitionId ? { processDefinitionId: filters.processDefinitionId } : {}),
          ...(filters.mine && filters.userId ? { assignedUserId: filters.userId } : {}),
        };

        const tasks = await this.prisma.productionTask.findMany({
          where,
          include: {
            processDefinition: true,
            priorityLevel: true,
            assignedUser: { select: { id: true, name: true, email: true } },
            machine: true,
            part: {
              include: {
                partType: true,
                unit: {
                  include: {
                    order: {
                      include: {
                        project: { include: { customer: { select: { name: true } } } },
                      },
                    },
                  },
                },
              },
            },
            unit: {
              include: {
                unitType: true,
                order: {
                  include: {
                    project: { include: { customer: { select: { name: true } } } },
                  },
                },
              },
            },
          },
          orderBy: [
            // Ready first, then InProgress, then PendingVerification, then OnHold
            { status: 'asc' },
            { priorityLevel: { sortOrder: 'desc' } },
            { sequenceOrder: 'asc' },
          ],
        });

        // Detailing/Engineering never has real ProductionTask rows -
        // splice in the synthetic entries here instead, respecting the
        // same priority/mine filters real tasks already went through.
        const isEngineeringDept = dept.code === 'ENG';
        const filteredEngineeringEntries = isEngineeringDept
          ? engineeringEntries.filter((e) =>
              (!filters.priorityLevelId || e.priorityLevel?.id === filters.priorityLevelId) &&
              !filters.mine, // "My Tasks" has no meaning here - nobody's assigned to an engineering stage
            )
          : [];
        const allTasks = isEngineeringDept ? [...tasks, ...filteredEngineeringEntries] : tasks;

        return {
          department: dept,
          taskCount: allTasks.length,
          tasks: allTasks,
        };
      }),
    );

    return { columns };
  }

  async getSummary(
    callerDeptIds: string[],
    hasViewAll: boolean,
    userId: string,
  ) {
    const effectiveDeptIds = hasViewAll ? undefined : callerDeptIds;

    const tasks = await this.prisma.productionTask.findMany({
      where: {
        ...(effectiveDeptIds ? { departmentId: { in: effectiveDeptIds } } : {}),
        status: {
          notIn: [TaskStatus.Pending, TaskStatus.Completed, TaskStatus.Rejected],
        },
      },
      include: { priorityLevel: true },
    });

    const byStatus = {} as Record<TaskStatus, number>;
    for (const status of Object.values(TaskStatus)) {
      byStatus[status] = 0;
    }
    for (const task of tasks) {
      byStatus[task.status]++;
    }

    // Group by priority
    const priorityMap = new Map<string, { priorityLevel: any; count: number }>();
    for (const task of tasks) {
      if (!priorityMap.has(task.priorityLevelId)) {
        priorityMap.set(task.priorityLevelId, { priorityLevel: task.priorityLevel, count: 0 });
      }
      priorityMap.get(task.priorityLevelId)!.count++;
    }

    // Count overdue (past estimated time)
    const overdueCount = tasks.filter((t) => {
      if (t.status !== TaskStatus.InProgress || !t.startedAt || !t.estimatedDurationMinutes) return false;
      const elapsedMinutes = (Date.now() - t.startedAt.getTime()) / 60000;
      return elapsedMinutes > t.estimatedDurationMinutes * 1.2; // 20% buffer
    }).length;

    return {
      totalVisible: tasks.length,
      byStatus,
      byPriority: Array.from(priorityMap.values()),
      overdueCount,
    };
  }
}

@ApiTags('Mission Control')
@ApiBearerAuth()
@Controller('mission-control')
export class MissionControlController {
  constructor(private readonly service: MissionControlService) {}

  @Get('board')
  @RequirePermissions('task:view')
  @ApiOperation({ summary: 'Kanban board grouped by department — primary Mission Control query' })
  getBoard(
    @CurrentUser() user: JwtPayload,
    @Query('departmentId') departmentId?: string,
    @Query('priorityLevelId') priorityLevelId?: string,
    @Query('processDefinitionId') processDefinitionId?: string,
    @Query('mine') mine?: string,
  ) {
    const hasViewAll = user.permissions.includes('task:view-all');
    return this.service.getBoard(user.departmentIds, hasViewAll, {
      departmentId,
      priorityLevelId,
      processDefinitionId,
      mine: mine === 'true',
      userId: user.sub,
    });
  }

  @Get('summary')
  @RequirePermissions('task:view')
  @ApiOperation({ summary: 'Dashboard header stats — counts by status and priority' })
  getSummary(@CurrentUser() user: JwtPayload) {
    const hasViewAll = user.permissions.includes('task:view-all');
    return this.service.getSummary(user.departmentIds, hasViewAll, user.sub);
  }
}

@Module({
  controllers: [MissionControlController],
  providers: [MissionControlService],
  exports: [MissionControlService],
})
export class MissionControlModule {}
