import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RouteTargetType } from '@hvacflow/shared-types';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcessRouteDto {
  @ApiProperty({ enum: RouteTargetType })
  @IsEnum(RouteTargetType)
  targetType: RouteTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  partTypeId?: string;

  @ApiProperty()
  @IsUUID()
  processDefinitionId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  sequenceOrder: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean = false;
}

export class UpdateProcessRouteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  sequenceOrder?: number;
}

export class ReorderRoutesDto {
  items: Array<{ id: string; sequenceOrder: number }>;
}

@Injectable()
export class ProcessRoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByType(unitTypeId?: string, partTypeId?: string) {
    if (!unitTypeId && !partTypeId) {
      throw new BadRequestException('Provide either unitTypeId or partTypeId');
    }

    return this.prisma.processRoute.findMany({
      where: {
        ...(unitTypeId ? { unitTypeId } : {}),
        ...(partTypeId ? { partTypeId } : {}),
        isActive: true,
      },
      include: {
        processDefinition: {
          include: { department: true, defaultPriorityLevel: true },
        },
        unitType: true,
        partType: true,
      },
      orderBy: { sequenceOrder: 'asc' },
    });
  }

  async create(dto: CreateProcessRouteDto) {
    // Validate that exactly one of unitTypeId/partTypeId is provided and matches targetType
    if (dto.targetType === RouteTargetType.UNIT_TYPE && !dto.unitTypeId) {
      throw new BadRequestException('unitTypeId required when targetType is UNIT_TYPE');
    }
    if (dto.targetType === RouteTargetType.PART_TYPE && !dto.partTypeId) {
      throw new BadRequestException('partTypeId required when targetType is PART_TYPE');
    }

    return this.prisma.processRoute.create({
      data: dto,
      include: {
        processDefinition: { include: { department: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProcessRouteDto) {
    const route = await this.prisma.processRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Process route not found');
    return this.prisma.processRoute.update({ where: { id }, data: dto });
  }

  async reorder(dto: ReorderRoutesDto) {
    await this.prisma.$transaction(
      dto.items.map(({ id, sequenceOrder }) =>
        this.prisma.processRoute.update({ where: { id }, data: { sequenceOrder } }),
      ),
    );
    return { success: true };
  }

  async remove(id: string) {
    const route = await this.prisma.processRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Process route not found');
    return this.prisma.processRoute.delete({ where: { id } });
  }
}
