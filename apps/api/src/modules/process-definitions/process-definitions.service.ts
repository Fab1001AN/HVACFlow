import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProcessDefinitionDto } from './dto/create-process-definition.dto';
import { PartialType } from '@nestjs/swagger';

class UpdateProcessDefinitionDto extends PartialType(CreateProcessDefinitionDto) {}

@Injectable()
export class ProcessDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

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
      throw new ConflictException(
        'Cannot delete process definition referenced by tasks or routes. Deactivate it instead.',
      );
    }

    return this.prisma.processDefinition.delete({ where: { id } });
  }
}
