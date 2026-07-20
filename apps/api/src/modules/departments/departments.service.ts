import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ReorderDto } from './dto/reorder.dto';
import { TaskStatus } from '@hvacflow/shared-types';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Same reasoning as ProcessDefinitionsService.impact() - toggling a
  // department off (e.g. Purchasing) while units currently depend on
  // it changes real behavior instantly (Supervisor Dashboard's
  // toggle-off vendor-part fallback, for one), so the frontend needs
  // real numbers to warn with before that toggle gets flipped.
  async impact(id: string) {
    const activeTasks = await this.prisma.productionTask.count({
      where: {
        departmentId: id,
        status: { in: [TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification, TaskStatus.OnHold] },
      },
    });
    const unitsCurrentlyHere = await this.prisma.unit.count({
      where: {
        currentDepartmentId: id,
        deletedAt: null,
        // Exclude units already on a terminal workflow stage - they're
        // done and shouldn't count toward "units affected if you change
        // this department". Uses the admin-configurable isTerminal flag,
        // not a hardcoded status/stage name.
        OR: [
          { currentWorkflowStageId: null },
          { currentWorkflowStage: { isTerminal: false } },
        ],
      },
    });
    return { activeTaskCount: activeTasks, unitsCurrentlyHere };
  }

  async findAll(isActive?: boolean) {
    return this.prisma.department.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);

    // Deactivating a department removes its shop-floor column (mission
    // control only builds columns for active departments), which would
    // strand any in-progress work there - the tasks still exist but become
    // invisible and unworkable. The frontend warns about this, but that's
    // advisory only; enforce it on the backend too. Block deactivation while
    // the department has tasks that aren't finished/cancelled.
    if (dto.isActive === false) {
      const activeTaskCount = await this.prisma.productionTask.count({
        where: { departmentId: id, status: { notIn: ['Completed', 'Rejected'] } },
      });
      if (activeTaskCount > 0) {
        throw new ConflictException(
          `Cannot deactivate this department - ${activeTaskCount} task(s) are still active in it. Those units would be stranded with no shop-floor column. Complete or reroute them first.`,
        );
      }
    }

    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async reorder(dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.items.map(({ id, sortOrder }) =>
        this.prisma.department.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.findAll();
  }

  async remove(id: string) {
    // Check if any process definitions or users reference this department
    const [processCount, userCount] = await Promise.all([
      this.prisma.processDefinition.count({ where: { departmentId: id } }),
      this.prisma.userDepartment.count({ where: { departmentId: id } }),
    ]);

    if (processCount > 0 || userCount > 0) {
      throw new ConflictException(
        'Cannot delete department with active process definitions or users. Deactivate it instead.',
      );
    }

    return this.prisma.department.delete({ where: { id } });
  }
}
