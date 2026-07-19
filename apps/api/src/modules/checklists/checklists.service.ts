import { Injectable, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChecklistTemplateDto {
  @ApiProperty() @IsUUID() processDefinitionId: string;
  @ApiProperty() @IsString() @MaxLength(255) name: string;
}

export class CreateChecklistItemDto {
  @ApiProperty() @IsString() @MaxLength(500) label: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) sortOrder?: number = 0;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isRequired?: boolean = true;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(processDefinitionId?: string, isActive?: boolean) {
    return this.prisma.checklistTemplate.findMany({
      where: {
        ...(processDefinitionId ? { processDefinitionId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: {
        processDefinition: { include: { department: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const tmpl = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        processDefinition: { include: { department: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!tmpl) throw new NotFoundException('Checklist template not found');
    return tmpl;
  }

  async create(dto: CreateChecklistTemplateDto) {
    return this.prisma.checklistTemplate.create({
      data: dto,
      include: { processDefinition: true },
    });
  }

  async update(id: string, dto: { name?: string; isActive?: boolean }) {
    await this.findOne(id);
    return this.prisma.checklistTemplate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    // Check if any responses exist (preserve history)
    const responseCount = await this.prisma.checklistResponse.count({
      where: { checklistItemTemplate: { checklistTemplateId: id } },
    });
    if (responseCount > 0) {
      // Soft-deactivate to preserve historical data
      return this.prisma.checklistTemplate.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.checklistTemplate.delete({ where: { id } });
  }

  async findItems(templateId: string) {
    await this.findOne(templateId);
    return this.prisma.checklistItemTemplate.findMany({
      where: { checklistTemplateId: templateId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addItem(templateId: string, dto: CreateChecklistItemDto) {
    await this.findOne(templateId);
    return this.prisma.checklistItemTemplate.create({
      data: { checklistTemplateId: templateId, ...dto },
    });
  }

  async updateItem(itemId: string, dto: UpdateChecklistItemDto) {
    const item = await this.prisma.checklistItemTemplate.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Checklist item not found');
    return this.prisma.checklistItemTemplate.update({ where: { id: itemId }, data: dto });
  }

  async removeItem(itemId: string) {
    const responseCount = await this.prisma.checklistResponse.count({
      where: { checklistItemTemplateId: itemId },
    });
    if (responseCount > 0) {
      throw new ConflictException(
        'Cannot delete checklist item with existing responses. Historical data must be preserved.',
      );
    }
    return this.prisma.checklistItemTemplate.delete({ where: { id: itemId } });
  }

  async reorderItems(templateId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.checklistItemTemplate.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.findItems(templateId);
  }

  /** Used by the task engine to instantiate checklist responses when a task starts */
  async instantiateForTask(taskId: string, processDefinitionId: string) {
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { processDefinitionId, isActive: true },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!template) return [];

    const responses = await this.prisma.checklistResponse.createMany({
      data: template.items.map((item) => ({
        productionTaskId: taskId,
        checklistItemTemplateId: item.id,
        isChecked: false,
      })),
      skipDuplicates: true,
    });

    return this.prisma.checklistResponse.findMany({
      where: { productionTaskId: taskId },
      include: { checklistItemTemplate: true },
      orderBy: { checklistItemTemplate: { sortOrder: 'asc' } },
    });
  }

  /**
   * Uncheck every checklist response for the given tasks - used when a task
   * is reopened so its quality checklist must be re-verified from scratch,
   * rather than carrying over the checkmarks from the previous completion
   * (which would let the task be re-completed without actually re-checking).
   * Accepts an optional transaction client so it can run inside the caller's
   * atomic transaction (e.g. task reopen).
   */
  async resetForTasks(taskIds: string[], tx?: Prisma.TransactionClient) {
    if (taskIds.length === 0) return;
    const client = tx ?? this.prisma;
    await client.checklistResponse.updateMany({
      where: { productionTaskId: { in: taskIds } },
      data: { isChecked: false, completedByUserId: null, completedAt: null },
    });
  }

  /** Check if all required items are checked for a given task */
  async checkCompletion(taskId: string) {
    const responses = await this.prisma.checklistResponse.findMany({
      where: { productionTaskId: taskId },
      include: { checklistItemTemplate: true },
    });

    const total = responses.length;
    const required = responses.filter((r) => r.checklistItemTemplate.isRequired);
    const checkedRequired = required.filter((r) => r.isChecked);

    return {
      total,
      required: required.length,
      checkedRequired: checkedRequired.length,
      allRequiredComplete: required.length === checkedRequired.length,
    };
  }

  async toggleResponse(taskId: string, responseId: string, isChecked: boolean, userId: string) {
    const response = await this.prisma.checklistResponse.findUnique({
      where: { id: responseId },
      include: { checklistItemTemplate: true },
    });

    if (!response || response.productionTaskId !== taskId) {
      throw new NotFoundException('Checklist response not found');
    }

    await this.prisma.checklistResponse.update({
      where: { id: responseId },
      data: {
        isChecked,
        completedByUserId: isChecked ? userId : null,
        completedAt: isChecked ? new Date() : null,
      },
    });

    return this.checkCompletion(taskId);
  }
}
