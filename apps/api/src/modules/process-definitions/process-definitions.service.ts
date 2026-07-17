import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProcessDefinitionDto } from './dto/create-process-definition.dto';
import { PartialType } from '@nestjs/swagger';
import { TaskStatus } from '@hvacflow/shared-types';

class UpdateProcessDefinitionDto extends PartialType(CreateProcessDefinitionDto) {}

@Injectable()
export class ProcessDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ProductionTask reads processDefinition via a live join, not a
  // snapshot - editing requiresChecklist/requiresVerification/etc. on a
  // process takes effect INSTANTLY for every task currently referencing
  // it, including ones already in progress on the shop floor right now.
  // This tells the frontend what's actually at stake before a risky
  // edit gets saved, so the UI can show a real "this affects N units
  // currently in production" warning instead of silently changing the
  // rules under someone's feet mid-task.
  async impact(id: string) {
    const activeTasks = await this.prisma.productionTask.findMany({
      where: {
        processDefinitionId: id,
        status: { in: [TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification, TaskStatus.OnHold] },
      },
      select: { id: true, unitId: true, part: { select: { unitId: true } } },
    });
    const unitIds = new Set<string>();
    for (const task of activeTasks) {
      const unitId = task.unitId ?? task.part?.unitId;
      if (unitId) unitIds.add(unitId);
    }
    return {
      activeTaskCount: activeTasks.length,
      affectedUnitCount: unitIds.size,
    };
  }

  findAll(departmentId?: string, isActive?: boolean) {
    return this.prisma.processDefinition.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: {
        department: true,
        defaultPriorityLevel: true,
        _count: { select: { checklistTemplates: true, processRoutes: true } },
      },
      orderBy: [{ department: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const pd = await this.prisma.processDefinition.findUnique({
      where: { id },
      include: {
        department: true,
        defaultPriorityLevel: true,
        checklistTemplates: {
          where: { isActive: true },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!pd) throw new NotFoundException('Process definition not found');
    return pd;
  }

  async create(dto: CreateProcessDefinitionDto) {
    return this.prisma.processDefinition.create({
      data: dto,
      include: { department: true, defaultPriorityLevel: true },
    });
  }

  async update(id: string, dto: Partial<CreateProcessDefinitionDto> & { isActive?: boolean }) {
    await this.findOne(id);
    return this.prisma.processDefinition.update({
      where: { id },
      data: dto,
      include: { department: true, defaultPriorityLevel: true },
    });
  }

  async remove(id: string) {
    const [taskCount, routeCount] = await Promise.all([
      this.prisma.productionTask.count({ where: { processDefinitionId: id } }),
      this.prisma.processRoute.count({ where: { processDefinitionId: id } }),
    ]);

    if (taskCount > 0 || routeCount > 0) {
      const archived = await this.prisma.processDefinition.update({
        where: { id },
        data: { isActive: false },
        include: { department: true, defaultPriorityLevel: true },
      });
      return { ...archived, archived: true, message: 'Process has production or route history, so it was archived instead of permanently deleted.' };
    }

    await this.findOne(id);
    return this.prisma.processDefinition.delete({ where: { id } });
  }
}
