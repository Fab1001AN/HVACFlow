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

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

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
