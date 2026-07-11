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

  async update(id: string, dto: UpdatePriorityLevelDto) {
    await this.findOne(id);
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
