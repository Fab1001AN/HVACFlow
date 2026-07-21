import {
  Injectable,
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Module,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { IsOptional, IsString, IsArray, IsUUID, IsBoolean, IsEnum } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { Prisma } from '@prisma/client';

// ─── Dashboard Module ─────────────────────────────────────────────────────────

class UpdatePreferencesDto {
  @IsOptional() @IsEnum(['kanban', 'list']) defaultView?: 'kanban' | 'list';
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) visibleDepartmentIds?: string[];
  @IsOptional() @IsEnum(['mine', 'all']) defaultDepartmentFilter?: 'mine' | 'all';
  @IsOptional() defaultPriorityFilter?: string | null;
  @IsOptional() @IsArray() taskCardFields?: string[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultPreferences = {
    defaultView: 'kanban',
    visibleDepartmentIds: [],
    defaultDepartmentFilter: 'mine',
    defaultPriorityFilter: null,
    taskCardFields: ['process', 'unit', 'part', 'priority', 'assignee', 'elapsed'],
    missionControlLayout: {},
  };

  async getPreferences(userId: string) {
    // Look up the user's role IDs directly — the JWT payload only carries
    // flattened permission codes, not role IDs, so we can't rely on the token.
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    const roleIds = userRoles.map((ur) => ur.roleId);

    // Get role-level defaults
    const roleConfigs = await this.prisma.roleDashboardConfig.findMany({
      where: { roleId: { in: roleIds } },
      orderBy: { updatedAt: 'asc' },
    });

    // Merge role configs (last wins)
    let merged: Record<string, unknown> = { ...this.defaultPreferences };
    for (const rc of roleConfigs) {
      merged = { ...merged, ...(rc.config as Record<string, unknown>) };
    }

    // Apply user preference overrides
    const userPref = await this.prisma.userPreference.findUnique({ where: { userId } });
    if (userPref) {
      merged = { ...merged, ...(userPref.preferences as Record<string, unknown>) };
    }

    return merged;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      update: { preferences: dto as any },
      create: { userId, preferences: dto as any },
    });
  }

  async getRoleConfig(roleId: string) {
    return this.prisma.roleDashboardConfig.findUnique({ where: { roleId } });
  }

  async updateRoleConfig(roleId: string, config: Record<string, unknown>) {
  const jsonConfig = config as Prisma.InputJsonValue;

  return this.prisma.roleDashboardConfig.upsert({
    where: { roleId },
    update: {
      config: jsonConfig,
    },
    create: {
      roleId,
      config: jsonConfig,
    },
  });
}

}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('preferences')
  async getPreferences(@CurrentUser() user: JwtPayload) {
    return this.service.getPreferences(user.sub);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePreferencesDto) {
    return this.service.updatePreferences(user.sub, dto);
  }

  @Get('role-config/:roleId')
  @RequirePermissions('dashboard:configure')
  getRoleConfig(@Param('roleId') roleId: string) {
    return this.service.getRoleConfig(roleId);
  }

  @Patch('role-config/:roleId')
  @RequirePermissions('dashboard:configure')
  updateRoleConfig(@Param('roleId') roleId: string, @Body() config: Record<string, unknown>) {
    return this.service.updateRoleConfig(roleId, config);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}

// ─── Reports Module ────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnitAuditTrail(unitId: string) {
    const tasks = await this.prisma.productionTask.findMany({
      where: {
        OR: [{ unitId }, { part: { unitId } }],
      },
      include: {
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        processDefinition: true,
        department: true,
        part: { include: { partType: true } },
      },
      orderBy: [{ part: { identifier: 'asc' } }, { sequenceOrder: 'asc' }],
    });

    return tasks.flatMap((task) =>
      task.statusHistory.map((h) => ({
        taskId: task.id,
        processName: task.processDefinition.name,
        departmentName: task.department.name,
        partIdentifier: task.part?.partType.name ?? null,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy.name,
        changedAt: h.changedAt,
        note: h.note,
      })),
    );
  }

  async getPartAuditTrail(partId: string) {
    return this.prisma.taskStatusHistory.findMany({
      where: { productionTask: { partId } },
      include: {
        changedBy: { select: { id: true, name: true } },
        productionTask: {
          include: { processDefinition: true, department: true },
        },
      },
      orderBy: { changedAt: 'asc' },
    });
  }

  async exportTasksCsv(
    departmentId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    const history = await this.prisma.taskStatusHistory.findMany({
      where: {
        ...(startDate || endDate ? {
          changedAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        } : {}),
        ...(departmentId ? { productionTask: { departmentId } } : {}),
      },
      include: {
        changedBy: { select: { name: true } },
        productionTask: {
          include: {
            processDefinition: true,
            department: true,
            part: { include: { partType: true, unit: { select: { serialNumber: true } } } },
            unit: { select: { serialNumber: true } },
          },
        },
      },
      orderBy: { changedAt: 'asc' },
    });

    const headers = ['TaskId', 'Process', 'Department', 'Unit', 'Part', 'From', 'To', 'ChangedBy', 'ChangedAt', 'Note'];
    const rows = history.map((h) => [
      h.productionTaskId,
      h.productionTask.processDefinition.name,
      h.productionTask.department.name,
      h.productionTask.part?.unit.serialNumber ?? h.productionTask.unit?.serialNumber ?? '',
      h.productionTask.part?.partType.name ?? '',
      h.fromStatus ?? '',
      h.toStatus,
      h.changedBy.name,
      h.changedAt.toISOString(),
      h.note ?? '',
    ]);

    return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  }
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('units/:id/audit-trail')
  @RequirePermissions('report:view')
  getUnitAuditTrail(@Param('id') id: string) {
    return this.service.getUnitAuditTrail(id);
  }

  @Get('parts/:id/audit-trail')
  @RequirePermissions('report:view')
  getPartAuditTrail(@Param('id') id: string) {
    return this.service.getPartAuditTrail(id);
  }

  @Get('reports/tasks')
  @RequirePermissions('report:view')
  async exportTasks(
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
    @Query('departmentId') departmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // The service already supports these filters; the controller previously
    // dropped them and always dumped every task ever. Pass them through so
    // reports can be scoped by department and date range.
    const csv = await this.service.exportTasksCsv(departmentId, startDate, endDate);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.csv"');
    res.send(csv);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
