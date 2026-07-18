import {
  Injectable, NotFoundException, ConflictException,
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

class ReshipDto {
  @IsOptional() @IsString() @MaxLength(200) carrierName?: string;
  @IsOptional() @IsDateString() shipDate?: string;
  @IsOptional() @IsString() @MaxLength(100) truckNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) driverName?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
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

  // Previously two separate frontend calls (create a ShipmentRecord, then
  // PATCH the rework's reshippedAt) with a real partial-failure risk: if
  // the second call failed, the unit would show a shipment logged with no
  // record it was actually a reship, or a rework marked reshipped with no
  // corresponding ShipmentRecord to prove it went out. Combined into one
  // atomic transaction - either both happen or neither does.
  async reship(id: string, dto: ReshipDto, userId: string) {
    const existing = await this.prisma.unitRework.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rework record not found');
    if (existing.status !== ReworkStatus.Completed) {
      throw new ConflictException('Mark this rework Completed before logging a reship');
    }
    if (existing.reshippedAt) {
      throw new ConflictException('This rework has already been reshipped');
    }

    const now = new Date();
    const [shipment, rework] = await this.prisma.$transaction([
      this.prisma.shipmentRecord.create({
        data: {
          unitId: existing.unitId,
          carrierName: dto.carrierName,
          shipDate: dto.shipDate ? new Date(dto.shipDate) : now,
          truckNumber: dto.truckNumber,
          trackingNumber: dto.trackingNumber,
          driverName: dto.driverName,
          notes: dto.notes ?? `Reship after rework: ${existing.issue}`,
          createdByUserId: userId,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      this.prisma.unitRework.update({
        where: { id },
        data: { reshippedAt: now },
        include: { assignedTo: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
      }),
    ]);

    await this.activityLog.log({
      unitId: existing.unitId,
      userId,
      action: ActivityAction.ShipmentLogged,
      description: `Reshipped after rework: ${existing.issue}`,
    });

    return { shipment, rework };
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

  @Post('reworks/:id/reship')
  @RequirePermissions('rework:manage')
  reship(@Param('id') id: string, @Body() dto: ReshipDto, @CurrentUser() user: JwtPayload) {
    return this.service.reship(id, dto, user.sub);
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
