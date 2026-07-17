import {
  Injectable, NotFoundException,
  Controller, Get, Post, Patch,
  Body, Param, Module,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ReworkStatus, ActivityAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { ActivityLogModule, ActivityLogService } from '../activity-log/activity-log.module';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateReworkDto {
  @IsString() @MaxLength(1000) issue: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class UpdateReworkDto {
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsEnum(ReworkStatus) status?: ReworkStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() reshippedAt?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  listByUnit(unitId: string) {
    return this.prisma.unitRework.findMany({
      where: { unitId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(unitId: string, dto: CreateReworkDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');

    const rework = await this.prisma.unitRework.create({
      data: { unitId, issue: dto.issue, assignedToUserId: dto.assignedToUserId, notes: dto.notes, createdByUserId: userId },
      include: { assignedTo: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
    });
    await this.activityLog.log({
      unitId,
      userId,
      action: ActivityAction.ReworkCreated,
      description: `Rework opened: ${dto.issue}`,
    });
    return rework;
  }

  async update(id: string, dto: UpdateReworkDto, userId: string) {
    const existing = await this.prisma.unitRework.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rework record not found');

    const justCompleted = dto.status === ReworkStatus.Completed && existing.status !== ReworkStatus.Completed;
    const updated = await this.prisma.unitRework.update({
      where: { id },
      data: {
        ...(dto.assignedToUserId !== undefined ? { assignedToUserId: dto.assignedToUserId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.reshippedAt !== undefined ? { reshippedAt: new Date(dto.reshippedAt) } : {}),
        ...(justCompleted ? { completedAt: new Date() } : {}),
      },
      include: { assignedTo: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
    });
    if (justCompleted) {
      await this.activityLog.log({
        unitId: existing.unitId,
        userId,
        action: ActivityAction.ReworkCompleted,
        description: `Rework completed: ${existing.issue}`,
      });
    }
    return updated;
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Rework')
@ApiBearerAuth()
@Controller()
export class ReworkController {
  constructor(private readonly service: ReworkService) {}

  @Get('units/:unitId/reworks')
  @RequirePermissions('unit:view')
  listByUnit(@Param('unitId') unitId: string) {
    return this.service.listByUnit(unitId);
  }

  @Post('units/:unitId/reworks')
  @RequirePermissions('rework:manage')
  create(@Param('unitId') unitId: string, @Body() dto: CreateReworkDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(unitId, dto, user.sub);
  }

  @Patch('reworks/:id')
  @RequirePermissions('rework:manage')
  update(@Param('id') id: string, @Body() dto: UpdateReworkDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.sub);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [ActivityLogModule],
  controllers: [ReworkController],
  providers: [ReworkService],
  exports: [ReworkService],
})
export class ReworkModule {}
