import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePriorityLevelDto } from './dto/create-priority-level.dto';
import { UpdatePriorityLevelDto } from './dto/update-priority-level.dto';
import { ReorderDto } from '../departments/dto/reorder.dto';

@Injectable()
export class PriorityLevelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(isActive?: boolean) {
    return this.prisma.priorityLevel.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findDefault() {
    return this.prisma.priorityLevel.findFirst({ where: { isDefault: true, isActive: true } });
  }

  async findOne(id: string) {
    const pl = await this.prisma.priorityLevel.findUnique({ where: { id } });
    if (!pl) throw new NotFoundException('Priority level not found');
    return pl;
  }

  async create(dto: CreatePriorityLevelDto) {
    if (dto.isDefault) {
      // Clear other defaults
      await this.prisma.priorityLevel.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.priorityLevel.create({ data: dto });
  }

  // Unit creation falls back to the default priority level when none is
  // specified (units.service.ts) and immediately uses its id - so if no
  // active default exists, creating a unit throws. These guards ensure the
  // last active default can never be removed, deactivated, or un-defaulted,
  // the same "protect the essential singleton" idea as the admin-lockout
  // guards. Throws if the given change to `id` would leave zero active
  // defaults.
  private async assertNotRemovingLastDefault(id: string, change: 'delete' | 'deactivate' | 'undefault') {
    const target = await this.prisma.priorityLevel.findUnique({ where: { id } });
    if (!target?.isDefault || !target.isActive) return; // not the (active) default -> nothing to protect
    const otherActiveDefaults = await this.prisma.priorityLevel.count({
      where: { id: { not: id }, isDefault: true, isActive: true },
    });
    if (otherActiveDefaults === 0) {
      const verb = change === 'delete' ? 'delete' : change === 'deactivate' ? 'deactivate' : 'unset';
      throw new ConflictException(
        `Cannot ${verb} the default priority level - the system needs one active default (new units fall back to it). Set another level as default first.`,
      );
    }
  }

  async update(id: string, dto: UpdatePriorityLevelDto) {
    await this.findOne(id);
    // Block turning off the only active default (via isDefault:false or
    // isActive:false), which would break unit creation.
    if (dto.isDefault === false) await this.assertNotRemovingLastDefault(id, 'undefault');
    if (dto.isActive === false) await this.assertNotRemovingLastDefault(id, 'deactivate');
    if (dto.isDefault) {
      await this.prisma.priorityLevel.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.priorityLevel.update({ where: { id }, data: dto });
  }

  async reorder(dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.items.map(({ id, sortOrder }) =>
        this.prisma.priorityLevel.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.findAll();
  }

  async remove(id: string) {
    await this.assertNotRemovingLastDefault(id, 'delete');

    const [orderCount, taskCount] = await Promise.all([
      this.prisma.order.count({ where: { priorityLevelId: id } }),
      this.prisma.productionTask.count({ where: { priorityLevelId: id } }),
    ]);

    if (orderCount > 0 || taskCount > 0) {
      throw new ConflictException(
        'Cannot delete priority level in use. Deactivate it instead.',
      );
    }

    return this.prisma.priorityLevel.delete({ where: { id } });
  }
}
