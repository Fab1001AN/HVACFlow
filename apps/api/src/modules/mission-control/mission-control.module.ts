import { Injectable, Controller, Get, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload, TaskStatus } from '@hvacflow/shared-types';

@Injectable()
export class MissionControlService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Build Kanban columns in parallel
    const columns = await Promise.all(
      departments.map(async (dept) => {
        const where: any = {
          departmentId: dept.id,
          status: { in: activeStatuses },
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

        return {
          department: dept,
          taskCount: tasks.length,
          tasks,
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
